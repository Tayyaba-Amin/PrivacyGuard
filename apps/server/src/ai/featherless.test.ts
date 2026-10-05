/**
 * Featherless provider tests.
 *
 * The Featherless endpoint is replaced by a local mock HTTP server, so these
 * tests never make a real AI call. What they pin down is the wire contract and
 * the failure taxonomy the rest of the pipeline depends on.
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createFeatherlessProvider } from './featherless.js';

const API_KEY = 'fl-test-key-do-not-leak';

type CapturedRequest = {
  method: string;
  url: string;
  authorization: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
};

type MockBehaviour = {
  status?: number;
  body?: string;
  /** Never answers, so the caller's timeout has to fire. */
  hang?: boolean;
  contentType?: string;
};

let server: Server;
let baseUrl: string;
let behaviour: MockBehaviour;
let requests: CapturedRequest[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

/** Builds a Featherless-shaped chat-completions body wrapping `content`. */
function completionsBody(content: string, finishReason = 'stop'): string {
  return JSON.stringify({
    id: 'cmpl-mock',
    object: 'chat.completion',
    created: 1,
    model: 'mock/model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  });
}

/**
 * The envelope a hybrid reasoning model returns when `max_tokens` is spent on
 * its thinking: HTTP 200, a populated `reasoning` field, and an empty answer.
 */
function reasoningOnlyBody(reasoning: string): string {
  return JSON.stringify({
    id: 'cmpl-mock',
    object: 'chat.completion',
    model: 'mock/model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', reasoning, content: '' },
        finish_reason: 'length',
      },
    ],
  });
}

function validReportContent(): string {
  return JSON.stringify({
    analyses: [
      {
        findingId: 'pg_001_6_22',
        isSensitive: true,
        confidence: 0.9,
        severity: 'HIGH',
        explanation: 'A personal mailbox that can be used to reset this account password.',
        recommendation: 'Remove it before sharing.',
      },
    ],
    summary: 'One personal identifier is exposed.',
  });
}

beforeEach(async () => {
  requests = [];
  behaviour = { status: 200, body: completionsBody(validReportContent()) };

  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void readBody(req).then((body) => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        authorization: req.headers.authorization,
        headers: req.headers,
        body,
      });

      if (behaviour.hang) return;

      res.writeHead(behaviour.status ?? 200, {
        'Content-Type': behaviour.contentType ?? 'application/json',
      });
      res.end(behaviour.body ?? '');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function provider(overrides: Partial<Parameters<typeof createFeatherlessProvider>[0]> = {}) {
  return createFeatherlessProvider({
    apiKey: API_KEY,
    model: 'mock/model',
    baseUrl,
    timeoutMs: 1_000,
    ...overrides,
  });
}

const PROMPT = { system: 'system rules', user: '{"text":"hello"}' };

describe('Featherless request format', () => {
  it('calls the OpenAI-compatible chat completions endpoint', async () => {
    const result = await provider().complete(PROMPT, 500);

    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);

    const [request] = requests;
    assert.equal(request?.method, 'POST');
    assert.equal(request?.url, '/v1/chat/completions');
    assert.equal(request?.headers['content-type'], 'application/json');
  });

  it('sends the key as a bearer header and never in the body or URL', async () => {
    await provider().complete(PROMPT, 500);

    const [request] = requests;
    assert.equal(request?.authorization, `Bearer ${API_KEY}`);
    assert.equal(request?.body.includes(API_KEY), false);
    assert.equal(request?.url.includes(API_KEY), false);
  });

  it('sends the configured model with both prompt messages', async () => {
    await provider({ model: 'acme/analyst-7b' }).complete(PROMPT, 321);

    const payload = JSON.parse(requests[0]?.body ?? '{}') as {
      model: string;
      messages: { role: string; content: string }[];
      max_tokens: number;
      stream: boolean;
    };

    assert.equal(payload.model, 'acme/analyst-7b');
    assert.equal(payload.max_tokens, 321);
    assert.equal(payload.stream, false);
    assert.deepEqual(
      payload.messages.map((message) => message.role),
      ['system', 'user'],
    );
    assert.equal(payload.messages[0]?.content, 'system rules');
    assert.equal(payload.messages[1]?.content, '{"text":"hello"}');
  });

  it('switches chat-template thinking off so a reasoning model spends its budget on the answer', async () => {
    await provider().complete(PROMPT, 500);

    const payload = JSON.parse(requests[0]?.body ?? '{}') as {
      chat_template_kwargs?: { enable_thinking?: boolean };
    };

    assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: false });
  });

  it('includes the application attribution headers Featherless asks for', async () => {
    await provider().complete(PROMPT, 500);

    const [request] = requests;
    assert.equal(typeof request?.headers['x-title'], 'string');
    assert.equal(typeof request?.headers['http-referer'], 'string');
  });

  it('reports itself as configured only when a key is present', () => {
    assert.equal(provider().isConfigured(), true);
    assert.equal(provider({ apiKey: undefined }).isConfigured(), false);
    assert.equal(provider({ apiKey: '' }).isConfigured(), false);
  });

  it('exposes the provider id and model but never the key', () => {
    const instance = provider();

    assert.equal(instance.id, 'featherless');
    assert.equal(instance.model, 'mock/model');
    assert.equal(JSON.stringify(instance).includes(API_KEY), false);
    assert.equal(`${instance.id}${instance.model}`.includes(API_KEY), false);
  });
});

describe('Featherless success response', () => {
  it('returns the assistant message content', async () => {
    behaviour.body = completionsBody(validReportContent());

    const result = await provider().complete(PROMPT, 500);

    assert.equal(result.ok, true);
    assert.ok(result.ok && JSON.parse(result.content).summary === 'One personal identifier is exposed.');
  });

  it('accepts a markdown-fenced JSON body', async () => {
    behaviour.body = completionsBody('```json\n{"analyses":[{"findingId":"a","isSensitive":true,"confidence":0.5,"severity":"LOW","explanation":"x","recommendation":"y"}]}\n```');

    const result = await provider().complete(PROMPT, 500);

    assert.equal(result.ok, true);
    assert.ok(result.ok && result.content.includes('findingId'));
  });
});

describe('Featherless failures', () => {
  it('reports a missing API key without making a request', async () => {
    const result = await provider({ apiKey: undefined }).complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'missing_api_key' });
    assert.equal(requests.length, 0);
  });

  it('reports an HTTP error with the status code', async () => {
    behaviour = { status: 429, body: JSON.stringify({ error: 'rate limited' }) };

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'http_error', httpStatus: 429 });
  });

  it('reports an HTTP error for a server fault without echoing the provider body', async () => {
    behaviour = { status: 500, body: 'internal error mentioning user text jane@example.com' };

    const result = await provider().complete(PROMPT, 500);

    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes('jane@example.com'), false);
  });

  it('times out instead of hanging', async () => {
    behaviour.hang = true;

    const started = Date.now();
    const result = await provider({ timeoutMs: 1_000 }).complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'timeout' });
    assert.ok(Date.now() - started < 5_000, 'the call should return promptly after the timeout');
  });

  it('reports a network failure when the endpoint is unreachable', async () => {
    const result = await provider({ baseUrl: 'http://127.0.0.1:1/v1', timeoutMs: 2_000 }).complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'network_error' });
  });

  it('reports a malformed envelope when the body is not JSON', async () => {
    behaviour.body = '<html>gateway error</html>';

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'malformed_response' });
  });

  it('reports a malformed envelope when choices are missing', async () => {
    behaviour.body = JSON.stringify({ id: 'cmpl', object: 'chat.completion' });

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'malformed_response' });
  });

  it('reports a malformed envelope when the message content is empty', async () => {
    behaviour.body = completionsBody('   ');

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'malformed_response' });
  });

  it('reports a malformed envelope when an error body arrives with a 200 status', async () => {
    behaviour = { status: 200, body: JSON.stringify({ error: { message: 'something went wrong' } }) };

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'malformed_response' });
  });

  it('reports an unusable model separately from a malformed response', async () => {
    behaviour = {
      status: 404,
      body: JSON.stringify({
        error: { message: 'model not found', type: 'invalid_request_error', code: 'model_not_found' },
      }),
    };

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'model_not_found', httpStatus: 404 });
  });

  it('reports an unusable model even when the error arrives with a 200 status', async () => {
    behaviour = {
      status: 200,
      body: JSON.stringify({ error: { message: 'no capacity', code: 'model_not_available' } }),
    };

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'model_not_found', httpStatus: 200 });
  });

  it('never returns the provider error message alongside a model error', async () => {
    behaviour = {
      status: 404,
      body: JSON.stringify({ error: { message: 'no access to jane@example.com', code: 'model_not_found' } }),
    };

    const result = await provider().complete(PROMPT, 500);

    assert.equal(JSON.stringify(result).includes('jane@example.com'), false);
  });

  it('reports an exhausted token budget separately from a malformed response', async () => {
    behaviour.body = reasoningOnlyBody('thinking about the request at length');

    const result = await provider().complete(PROMPT, 500);

    assert.deepEqual(result, { ok: false, reason: 'incomplete_response' });
  });

  it('does not read a reasoning trace as the answer', async () => {
    behaviour.body = reasoningOnlyBody('The answer would be {"analyses":[]}');

    const result = await provider().complete(PROMPT, 500);

    assert.equal(result.ok, false);
  });

  it('propagates a caller abort without leaking the key', async () => {
    behaviour.hang = true;
    const controller = new AbortController();
    const pending = provider().complete(PROMPT, 500, controller.signal);
    controller.abort();

    const result = await pending;

    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(API_KEY), false);
  });
});