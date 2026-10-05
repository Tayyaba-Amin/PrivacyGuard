/**
 * Featherless AI provider.
 *
 * Featherless serves an OpenAI-compatible `POST {baseUrl}/chat/completions`, so
 * this is a single `fetch` with no SDK and no other provider involved. The API
 * key is read from server configuration, attached as a bearer header, and never
 * leaves this module: it is not logged, not echoed into a prompt, and not
 * returned to the caller.
 *
 * Every expected failure — missing key, HTTP error, unusable model, timeout,
 * network error, exhausted token budget, malformed envelope — is returned as a
 * tagged result so the pipeline can fall back to the deterministic engine instead
 * of throwing.
 */

import type {
  AiPrompt,
  AiProvider,
  AiProviderId,
  AiProviderResult,
  AiStatusReason,
} from './types.js';

/** Client attribution headers Featherless asks integrations to send. */
const APP_REFERER = 'https://github.com/privacyguard';
const APP_TITLE = 'PrivacyGuard';

/** Guard against a pathologically large completion body. */
const MAX_RESPONSE_BYTES = 256 * 1024;

export type FeatherlessProviderOptions = {
  apiKey: string | undefined;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

/**
 * Provider error codes that mean "the model you asked for cannot be run", as
 * opposed to "the request was rejected". A misconfigured `FEATHERLESS_MODEL` is
 * a configuration problem, so it is reported as one instead of being folded
 * into `malformed_response`.
 */
const MODEL_ERROR_CODES = new Set([
  'model_not_found',
  'model_not_available',
  'invalid_model',
  'unsupported_model',
]);

/**
 * Recovers only the machine-readable `error.code` from a provider error
 * envelope. The message is deliberately dropped: it can quote the prompt, and
 * nothing from it is ever logged or returned. `null` means the body is not a
 * recognisable error envelope.
 */
function readProviderErrorCode(text: string | null): string | null {
  if (text === null) return null;

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return null;
  }

  if (typeof body !== 'object' || body === null) return null;

  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * Reads a response body as text, capped by `MAX_RESPONSE_BYTES` so an oversized
 * or unstreamable body cannot be buffered. Returns null when the body cannot be
 * read at all, which the caller treats the same as a malformed response.
 */
async function readBoundedBody(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? null : text;
  } catch {
    return null;
  }
}

type CompletionRead =
  | { ok: true; content: string }
  | { ok: false; reason: Extract<AiStatusReason, 'malformed_response' | 'incomplete_response'> };

/**
 * Reads `choices[0].message.content` from a chat-completions body.
 *
 * A reasoning model writes its thinking into a separate `reasoning` field and
 * can exhaust `max_tokens` before it writes an answer, which arrives as an
 * empty content with `finish_reason: 'length'`. That is an exhausted budget,
 * not a broken envelope, so it keeps its own reason. Anything else that fails
 * this shape check is a protocol error.
 */
function readCompletion(body: unknown): CompletionRead {
  if (typeof body !== 'object' || body === null) return { ok: false, reason: 'malformed_response' };

  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return { ok: false, reason: 'malformed_response' };

  const choice = choices[0] as { message?: unknown; finish_reason?: unknown } | undefined;
  const message = choice?.message;
  if (typeof message !== 'object' || message === null) return { ok: false, reason: 'malformed_response' };

  const content = (message as { content?: unknown }).content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return {
      ok: false,
      reason: choice?.finish_reason === 'length' ? 'incomplete_response' : 'malformed_response',
    };
  }

  return { ok: true, content };
}

export function createFeatherlessProvider(options: FeatherlessProviderOptions): AiProvider {
  const { apiKey, model, baseUrl, timeoutMs, fetchImpl = fetch } = options;
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    id: 'featherless' as AiProviderId,
    model,

    isConfigured: () => typeof apiKey === 'string' && apiKey.length > 0,

    async complete(prompt: AiPrompt, maxTokens: number, signal?: AbortSignal): Promise<AiProviderResult> {
      if (!apiKey) {
        return { ok: false, reason: 'missing_api_key' };
      }

      const timeout = AbortSignal.timeout(timeoutMs);
      const deadline = signal ? AbortSignal.any([signal, timeout]) : timeout;

      let response: Response;

      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': APP_REFERER,
            'X-Title': APP_TITLE,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            temperature: 0.2,
            top_p: 0.9,
            max_tokens: maxTokens,
            stream: false,
            // Qwen3-class models are hybrid reasoning models: they spend the
            // whole completion budget writing a separate `reasoning` field and
            // return an empty `content`, which reads as an empty answer rather
            // than the JSON this pipeline needs. Switching the chat template's
            // thinking off keeps the reply inside the budget. Backends that do
            // not implement the flag ignore it and behave as before.
            chat_template_kwargs: { enable_thinking: false },
          }),
          signal: deadline,
        });
      } catch (error) {
        if (signal?.aborted) return { ok: false, reason: 'aborted' };
        if (isAbortError(error)) return { ok: false, reason: 'timeout' };
        return { ok: false, reason: 'network_error' };
      }

      if (!response.ok) {
        // The provider's error body may quote the prompt, so it is never logged
        // and never returned. It is still read once, and only to recover the
        // machine-readable `error.code`, which is what separates a misconfigured
        // model from a rejected request.
        const code = readProviderErrorCode(await readBoundedBody(response));
        if (code !== null && MODEL_ERROR_CODES.has(code)) {
          return { ok: false, reason: 'model_not_found', httpStatus: response.status };
        }
        return { ok: false, reason: 'http_error', httpStatus: response.status };
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        return { ok: false, reason: 'malformed_response' };
      }

      const text = await readBoundedBody(response);
      if (text === null) {
        return { ok: false, reason: 'malformed_response' };
      }

      // An error envelope occasionally arrives with a 200, so the status line
      // alone cannot be trusted.
      const errorCode = readProviderErrorCode(text);
      if (errorCode !== null && MODEL_ERROR_CODES.has(errorCode)) {
        return { ok: false, reason: 'model_not_found', httpStatus: response.status };
      }

      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        return { ok: false, reason: 'malformed_response' };
      }

      const completion = readCompletion(body);
      if (!completion.ok) {
        return { ok: false, reason: completion.reason };
      }

      return { ok: true, content: completion.content };
    },
  };
}