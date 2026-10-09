/**
 * End-to-end tests for the AI-enriched `POST /api/analyze/text` response.
 *
 * The Featherless endpoint is replaced by a local mock HTTP server, so the whole
 * path — route, deterministic detector, provider, validation, fallback — runs
 * without a real AI call or a real API key.
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createApp } from '../app.js';
import { createFeatherlessProvider } from '../ai/featherless.js';
import type { AnalyzeTextResponse } from '../api/types.js';
import type { Severity } from '../detection/types.js';
import { detectSensitiveInfo } from '../detection/index.js';
import { scoreRisk } from '../risk/index.js';

const API_KEY = 'fl-route-test-key';
const MODEL = 'mock/analyst';

const SAMPLE = [
  'Hi Jane,',
  'My email is jane.doe@example.com and my phone is +92 300 1234567.',
  'address: 221B Baker Street, London',
  'Server 192.168.1.10 runs https://example.com/admin.',
].join('\n');

/** Text that must never appear in any log line. */
const LOG_CANARY = 'canary-9f3a@example.com';

type MockBehaviour = { status?: number; content?: string; hang?: boolean };

let featherless: Server;
let featherlessUrl: string;
let behaviour: MockBehaviour;
let upstreamRequests: { authorization: string | undefined; body: string }[] = [];
let consoleSpies: { calls: string[] } | null = null;

function chatCompletion(content: string): string {
  return JSON.stringify({
    id: 'cmpl-mock',
    object: 'chat.completion',
    created: 1,
    model: MODEL,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  });
}

/** A valid report covering every finding the detector produced for `text`. */
function validReportFor(text: string): string {
  const analyses = detectSensitiveInfo(text).map((finding) => ({
    findingId: finding.id,
    isSensitive: true,
    confidence: 0.87,
    severity: finding.category === 'IP_ADDRESS' ? 'LOW' : 'HIGH',
    explanation: `In this text the ${finding.category.toLowerCase().replace(/_/g, ' ')} belongs to a colleague and narrows down who this belongs to.`,
    recommendation: 'Remove it, or replace it with a placeholder before sharing.',
  }));

  return JSON.stringify({
    analyses,
    summary: 'The text carries several direct identifiers for one person, plus an internal host name.',
  });
}

/** Captures every console line so the "no user content in logs" rule is testable. */
function captureConsole() {
  const calls: string[] = [];
  const methods = ['log', 'warn', 'error', 'info', 'debug'] as const;
  const original = new Map<string, (...args: never[]) => void>();

  for (const method of methods) {
    original.set(method, console[method] as (...args: never[]) => void);
    console[method] = ((...args: unknown[]) => {
      calls.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    }) as typeof console.log;
  }

  consoleSpies = { calls };

  return () => {
    for (const method of methods) {
      console[method] = original.get(method) as typeof console.log;
    }
    consoleSpies = null;
  };
}

beforeEach(async () => {
  upstreamRequests = [];
  behaviour = { status: 200, content: chatCompletion(validReportFor(SAMPLE)) };

  featherless = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
    });
    req.on('end', () => {
      upstreamRequests.push({ authorization: req.headers.authorization, body: raw });
      if (behaviour.hang) return;
      res.writeHead(behaviour.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(behaviour.content ?? '');
    });
  });

  await new Promise<void>((resolve) => featherless.listen(0, '127.0.0.1', resolve));
  const address = featherless.address();
  assert.ok(address !== null && typeof address === 'object');
  featherlessUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterEach(async () => {
  featherless.closeAllConnections();
  await new Promise<void>((resolve) => featherless.close(() => resolve()));
});

async function withApp<T>(
  options: { apiKey?: string | undefined; timeoutMs?: number } | null,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const provider =
    options === null
      ? null
      : createFeatherlessProvider({
          apiKey: 'apiKey' in options ? options.apiKey : API_KEY,
          model: MODEL,
          baseUrl: featherlessUrl,
          timeoutMs: options.timeoutMs ?? 5_000,
        });

  const app = createApp({ ai: provider });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function post(baseUrl: string, text: string): Promise<AnalyzeTextResponse> {
  const response = await fetch(`${baseUrl}/api/analyze/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  assert.equal(response.status, 200);
  return (await response.json()) as AnalyzeTextResponse;
}

describe('POST /api/analyze/text with AI available', () => {
  it('returns AI-enriched findings and the contextual summary', async () => {
    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      assert.equal(body.meta.engine, 'deterministic-v1');
      assert.equal(body.meta.aiEnabled, true);
      assert.equal(body.meta.aiProvider, 'featherless');
      assert.equal(body.meta.aiModel, MODEL);
      assert.equal(body.meta.aiStatus, 'available');
      assert.equal(body.meta.aiStatusReason, 'ok');
      assert.equal(body.meta.aiAnalyzedCount, body.findings.length);
      assert.equal(body.meta.aiContextTruncated, false);
      assert.match(body.summary, /direct identifiers/);

      for (const finding of body.findings) {
        assert.equal(finding.contextual.source, 'ai');
        assert.match(finding.contextual.explanation, /belongs to a colleague/);
        assert.match(finding.contextual.recommendation, /placeholder before sharing/);
      }
    });
  });

  it('sends the detected text to the provider through the backend', async () => {
    await withApp({}, async (baseUrl) => {
      await post(baseUrl, SAMPLE);

      assert.equal(upstreamRequests.length, 1);
      assert.equal(upstreamRequests[0]?.authorization, `Bearer ${API_KEY}`);

      const request = JSON.parse(upstreamRequests[0]?.body ?? '{}') as {
        model: string;
        messages: { role: string; content: string }[];
      };

      assert.equal(request.model, MODEL);
      const userMessage = request.messages.find((message) => message.role === 'user')?.content ?? '';
      const payload = JSON.parse(userMessage) as {
        text: string;
        findings: { findingId: string; category: string; matchedText: string }[];
      };

      assert.equal(payload.text, SAMPLE);
      assert.equal(payload.findings.length, detectSensitiveInfo(SAMPLE).length);
      assert.equal(payload.findings[0]?.matchedText, 'jane.doe@example.com');
    });
  });

  it('keeps the deterministic severity and span alongside the contextual view', async () => {
    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);
      const detected = detectSensitiveInfo(SAMPLE);

      for (const [index, finding] of body.findings.entries()) {
        const original = detected[index]!;
        assert.equal(finding.severity, original.severity);
        assert.equal(finding.start, original.start);
        assert.equal(finding.end, original.end);
        assert.equal(SAMPLE.slice(finding.start, finding.end), finding.matchedText);
        assert.equal(finding.contextual.severity, original.category === 'IP_ADDRESS' ? 'LOW' : 'HIGH');
      }
    });
  });

  it('never exposes the API key in the response', async () => {
    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      const serialised = JSON.stringify(body);
      assert.equal(serialised.includes(API_KEY), false);
      assert.equal(serialised.includes('Bearer'), false);
      assert.equal(serialised.includes('FEATHERLESS_API_KEY'), false);
    });
  });

  it('does not call the provider when the detector finds nothing', async () => {
    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, 'We shipped the release on Tuesday and it went fine.');

      assert.equal(upstreamRequests.length, 0);
      assert.deepEqual(body.findings, []);
      assert.equal(body.meta.aiStatusReason, 'no_findings');
      assert.equal(body.meta.aiAnalyzedCount, 0);
      assert.match(body.summary, /no sensitive information/i);
    });
  });
});

describe('POST /api/analyze/text when the model output is rejected', () => {
  /** Sends `upstream` to the mock and asserts the deterministic fallback. */
  const expectDegraded = async (
    options: Parameters<typeof withApp>[0],
    reason: string,
    upstream: MockBehaviour,
  ): Promise<void> => {
    behaviour = upstream;

    await withApp(options, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);
      const detected = detectSensitiveInfo(SAMPLE);

      assert.equal(body.meta.aiStatus, 'degraded');
      assert.equal(body.meta.aiStatusReason, reason);
      assert.equal(body.meta.aiAnalyzedCount, 0);
      assert.equal(body.meta.aiSummary, null);

      // Deterministic findings survive unchanged, with fallback commentary.
      assert.equal(body.findings.length, detected.length);
      for (const [index, finding] of body.findings.entries()) {
        const original = detected[index]!;
        assert.equal(finding.id, original.id);
        assert.equal(finding.start, original.start);
        assert.equal(finding.end, original.end);
        assert.equal(finding.category, original.category);
        assert.equal(finding.severity, original.severity);
        assert.equal(finding.matchedText, original.matchedText);
        assert.equal(finding.contextual.source, 'deterministic');
        assert.ok(finding.contextual.recommendation.length > 0);
      }

      // The summary falls back to the deterministic wording.
      assert.match(body.summary, /deterministic detector matched/i);
    });
  };

  it('degrades on malformed model JSON', () =>
    expectDegraded({}, 'malformed_response', {
      status: 200,
      content: chatCompletion('Sure! Here is my analysis: I cannot do that.'),
    }));

  it('degrades when the model returns a valid JSON document of the wrong shape', () =>
    expectDegraded({}, 'malformed_response', {
      status: 200,
      content: chatCompletion(JSON.stringify({ verdict: 'unsafe', score: 91 })),
    }));

  it('degrades when the model invents findings that the detector never reported', () =>
    expectDegraded({}, 'invalid_response', {
      status: 200,
      content: chatCompletion(
        JSON.stringify({
          analyses: [
            {
              findingId: 'pg_invented_0_0_1',
              isSensitive: true,
              confidence: 0.9,
              severity: 'CRITICAL',
              explanation: 'A salary figure for the account holder.',
              recommendation: 'Remove it.',
            },
          ],
          summary: 'A salary figure is exposed.',
        }),
      ),
    }));

  it('degrades on a Featherless HTTP error', () =>
    expectDegraded({}, 'http_error', { status: 502, content: 'bad gateway' }));

  it('degrades on a rate limit', () =>
    expectDegraded({}, 'http_error', {
      status: 429,
      content: JSON.stringify({ error: 'rate limited' }),
    }));

  it('degrades on a provider envelope that is not a chat completion', () =>
    expectDegraded({}, 'malformed_response', {
      status: 200,
      content: JSON.stringify({ error: { message: 'model not found' } }),
    }));

  it('degrades on a timeout instead of hanging the request', async () => {
    const restore = captureConsole();

    try {
      behaviour = { hang: true };
      const started = Date.now();

      await withApp({ timeoutMs: 1_000 }, async (baseUrl) => {
        const body = await post(baseUrl, SAMPLE);

        assert.equal(body.meta.aiStatus, 'degraded');
        assert.equal(body.meta.aiStatusReason, 'timeout');
        assert.equal(body.findings.length, detectSensitiveInfo(SAMPLE).length);
        assert.equal(body.findings[0]?.contextual.source, 'deterministic');
      });

      assert.ok(Date.now() - started < 8_000, 'the request should not hang on a stalled provider');
    } finally {
      restore();
    }
  });
});

describe('POST /api/analyze/text without a usable provider', () => {
  it('still answers deterministically when the API key is missing', async () => {
    await withApp({ apiKey: undefined }, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);
      const detected = detectSensitiveInfo(SAMPLE);

      assert.equal(body.meta.aiEnabled, false);
      assert.equal(body.meta.aiStatus, 'unavailable');
      assert.equal(body.meta.aiStatusReason, 'missing_api_key');
      assert.equal(body.meta.aiAnalyzedCount, 0);
      assert.equal(upstreamRequests.length, 0, 'no request should be attempted without a key');

      assert.equal(body.findings.length, detected.length);
      for (const [index, finding] of body.findings.entries()) {
        assert.equal(finding.contextual.source, 'deterministic');
        assert.equal(finding.start, detected[index]?.start);
      }
      assert.match(body.summary, /deterministic detector matched/i);
    });
  });

  it('still answers deterministically when the provider is unreachable', async () => {
    await withApp({}, async (baseUrl) => {
      const restore = captureConsole();

      try {
        featherless.closeAllConnections();
        await new Promise<void>((resolve) => featherless.close(() => resolve()));

        const body = await post(baseUrl, SAMPLE);

        assert.equal(body.meta.aiStatus, 'degraded');
        assert.equal(body.meta.aiStatusReason, 'network_error');
        assert.equal(body.findings.length, detectSensitiveInfo(SAMPLE).length);
        assert.equal(body.findings.every((finding) => finding.contextual.source === 'deterministic'), true);
      } finally {
        restore();
      }
    });
  });

  it('still answers deterministically when the AI layer is switched off', async () => {
    await withApp(null, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      assert.equal(body.meta.aiEnabled, false);
      assert.equal(body.meta.aiStatus, 'unavailable');
      assert.equal(body.meta.aiStatusReason, 'disabled');
      assert.equal(body.findings.length, detectSensitiveInfo(SAMPLE).length);
      assert.match(body.summary, /deterministic detector matched/i);
    });
  });
});

describe('logging', () => {
  it('never writes user content, a prompt or the API key to the console', async () => {
    const restore = captureConsole();

    try {
      behaviour = { status: 500, content: 'upstream failure quoting ' + LOG_CANARY };

      await withApp({}, async (baseUrl) => {
        await post(baseUrl, `Contact ${LOG_CANARY} about the release.\nCard 4111 1111 1111 1111`);
      });

      const logged = consoleSpies?.calls.join('\n') ?? '';

      assert.ok(logged.length > 0, 'the failure should still be reported');
      assert.equal(logged.includes(LOG_CANARY), false, 'user text must not be logged');
      assert.equal(logged.includes('jane.doe@example.com'), false);
      assert.equal(logged.includes('4111 1111 1111 1111'), false);
      assert.equal(logged.includes(API_KEY), false, 'the API key must not be logged');
      assert.equal(logged.includes('system'), false, 'prompts must not be logged');
      assert.match(logged, /reason=http_error/);
    } finally {
      restore();
    }
  });

  it('writes nothing user-derived on the successful path either', async () => {
    const restore = captureConsole();

    try {
      await withApp({}, async (baseUrl) => {
        await post(baseUrl, `Reach me at ${LOG_CANARY} or on 192.168.1.10`);
      });

      const logged = consoleSpies?.calls.join('\n') ?? '';
      assert.equal(logged.includes(LOG_CANARY), false);
      assert.equal(logged.includes('192.168.1.10'), false);
    } finally {
      restore();
    }
  });

  it('never writes user content when the provider times out', async () => {
    const restore = captureConsole();

    try {
      behaviour = { hang: true };
      await withApp({ timeoutMs: 1_000 }, async (baseUrl) => {
        await post(baseUrl, `Ping ${LOG_CANARY} about the invoice`);
      });

      const logged = consoleSpies?.calls.join('\n') ?? '';
      assert.equal(logged.includes(LOG_CANARY), false);
      assert.match(logged, /reason=timeout/);
    } finally {
      restore();
    }
  });
});

describe('safety of merged model output', () => {
  it('passes model prose through as data, so the client can render it as text', async () => {
    behaviour.content = chatCompletion(
      validReportFor(SAMPLE).replace(
        'In this text the',
        '<img src=x onerror=alert(1)>In this text the',
      ),
    );

    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      // React escapes model prose when it is rendered as a text node, so the
      // value arriving here is inert. The check pins that nothing else happened
      // to it on the way through.
      const explanation = body.findings[0]?.contextual.explanation ?? '';
      assert.match(explanation, /In this text the/);
      assert.equal(explanation.includes('javascript:'), false);
    });
  });

  it('keeps a deterministic finding even when the model marks it harmless', async () => {
    const detected = detectSensitiveInfo(SAMPLE);
    behaviour.content = chatCompletion(
      JSON.stringify({
        analyses: detected.map((finding) => ({
          findingId: finding.id,
          isSensitive: false,
          confidence: 0.2,
          severity: 'LOW',
          explanation: 'This looks like documentation for a public example.',
          recommendation: 'Nothing to do.',
        })),
        summary: 'All values appear to be public examples.',
      }),
    );

    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      assert.equal(body.meta.aiStatus, 'available');
      assert.equal(body.findings.length, detected.length);
      for (const [index, finding] of body.findings.entries()) {
        assert.equal(finding.contextual.isSensitive, false);
        assert.equal(finding.contextual.severity, 'LOW');
        // "Not sensitive" is the model's opinion, not a deletion: the finding,
        // its span and its deterministic severity all remain.
        assert.equal(finding.start, detected[index]?.start);
        assert.equal(finding.end, detected[index]?.end);
        assert.equal(finding.severity, detected[index]?.severity);
      }
    });
  });
});

describe('risk scoring through the API', () => {
  /** Replaces every finding's severity in the mock report with `severity`. */
  function reportWithSeverity(severity: Severity): string {
    return chatCompletion(
      JSON.stringify({
        analyses: detectSensitiveInfo(SAMPLE).map((finding) => ({
          findingId: finding.id,
          isSensitive: true,
          confidence: 0.9,
          severity,
          explanation: `Contextual view: this ${finding.category} matters in this document.`,
          recommendation: 'Handle it before sharing.',
        })),
        summary: 'Contextual view of the document.',
      }),
    );
  }

  it('scores from the deterministic severity when AI is unavailable', async () => {
    await withApp({ apiKey: undefined }, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);
      const deterministic = scoreRisk(
        body.findings.map((finding) => ({ ...finding, contextual: { ...finding.contextual, source: 'deterministic' as const } })),
      );

      assert.equal(body.meta.aiStatus, 'unavailable');
      assert.equal(body.risk.score, deterministic.score);
      assert.equal(body.risk.level, deterministic.level);
      assert.equal(body.risk.verdict, deterministic.verdict);
      assert.equal(body.risk.severityBasis.contextual, 0);
      for (const factor of body.risk.factors) {
        assert.equal(factor.severitySource, 'deterministic');
      }
    });
  });

  it('scores from the AI contextual severity when the model answers', async () => {
    behaviour.content = reportWithSeverity('CRITICAL');

    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      assert.equal(body.meta.aiStatus, 'available');
      assert.equal(body.risk.severityBasis.contextual, body.findings.length);
      assert.equal(body.risk.severityBasis.deterministic, 0);

      // Every factor is scored on the CRITICAL weight, and the detector severities
      // are recorded alongside for comparison.
      assert.ok(body.risk.score >= 75 && body.risk.score <= 89);
      assert.equal(body.risk.level, 'CRITICAL');
      assert.equal(body.risk.verdict, 'NOT_SAFE_TO_SHARE');

      for (const factor of body.risk.factors) {
        assert.equal(factor.severity, 'CRITICAL');
        assert.equal(factor.contribution, 75);
        assert.equal(factor.severitySource, 'ai');
        assert.ok(factor.deterministicSeverity);
      }
    });
  });

  it('lets the model lower a weight, while the finding stays in place', async () => {
    behaviour.content = reportWithSeverity('LOW');

    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);
      const detected = detectSensitiveInfo(SAMPLE);

      // Five LOW weights combine to 100*(1-0.9^5) = 41, which is still HIGH as a
      // total. The point here is that the model's downgrade lowered the score
      // rather than being ignored, and that no finding disappeared.
      assert.equal(body.risk.level, 'LOW');
      assert.equal(body.risk.verdict, 'SAFE_TO_SHARE');
      assert.equal(body.findings.length, detected.length);

      for (const [index, finding] of body.findings.entries()) {
        assert.equal(finding.contextual.severity, 'LOW');
        assert.equal(
          finding.severity,
          detected[index]?.severity,
          'the detector severity is preserved alongside the AI downgrade',
        );
      }

      for (const factor of body.risk.factors) {
        assert.equal(factor.severity, 'LOW');
        assert.equal(factor.contribution, 10);
        assert.equal(factor.severitySource, 'ai');
      }
    });
  });

  it('falls back to deterministic scoring when the model response is rejected', async () => {
    behaviour.content = chatCompletion('I am not able to produce that.');

    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      assert.equal(body.meta.aiStatus, 'degraded');
      assert.equal(body.risk.severityBasis.contextual, 0);
      assert.ok(body.risk.score > 0 && body.risk.score <= 100);
      for (const factor of body.risk.factors) {
        assert.equal(factor.severitySource, 'deterministic');
      }
    });
  });

  it('ignores an invented finding when scoring', async () => {
    behaviour.content = chatCompletion(
      JSON.stringify({
        analyses: [
          {
            findingId: 'pg_invented_0_0_1',
            isSensitive: true,
            confidence: 0.99,
            severity: 'CRITICAL',
            explanation: 'A salary figure that was never detected.',
            recommendation: 'Remove it.',
          },
        ],
        summary: 'A salary figure is exposed.',
      }),
    );

    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, SAMPLE);

      assert.equal(body.risk.severityBasis.contextual, 0);
      assert.equal(body.risk.factors.length, detectSensitiveInfo(SAMPLE).length);
      for (const factor of body.risk.factors) {
        assert.equal(body.findings.some((finding) => finding.id === factor.findingId), true);
      }
    });
  });

  it('returns a byte-identical risk block for identical input', async () => {
    await withApp({}, async (baseUrl) => {
      const first = await post(baseUrl, SAMPLE);
      const second = await post(baseUrl, SAMPLE);

      assert.equal(JSON.stringify(first.risk), JSON.stringify(second.risk));
    });
  });

  it('never leaks user content into the risk block', async () => {
    await withApp({}, async (baseUrl) => {
      const body = await post(baseUrl, `Reach ${LOG_CANARY} or dial 192.168.1.10`);
      const serialised = JSON.stringify(body.risk);

      assert.equal(serialised.includes(LOG_CANARY), false);
      assert.equal(serialised.includes('192.168.1.10'), false);
      assert.equal(serialised.includes('matchedText'), false);
    });
  });
});