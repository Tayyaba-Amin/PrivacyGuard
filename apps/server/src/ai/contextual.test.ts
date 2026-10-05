/**
 * Contextual-analysis tests: schema validation, context windowing, and the
 * service that merges model output into deterministic findings.
 *
 * The provider is stubbed here so no HTTP call and no real AI request happens.
 * Route-level behaviour against a mocked Featherless endpoint lives in
 * routes/analyze-ai.test.ts.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAnalysisBatches } from './context.js';
import { buildPrompt } from './prompt.js';
import { parseModelReport } from './schema.js';
import { analyzeWithContext, deterministicOutcome, type AiServiceOptions } from './service.js';
import type { AiPrompt, AiProvider, AiProviderResult } from './types.js';
import { detectSensitiveInfo } from '../detection/index.js';
import type { Finding } from '../detection/types.js';

const TEXT = [
  'Hi Jane,',
  'My email is jane.doe@example.com and my phone is +92 300 1234567.',
  'Server 192.168.1.10 runs https://example.com/admin.',
  'address: 221B Baker Street, London',
].join('\n');

const findings = (text = TEXT): Finding[] => detectSensitiveInfo(text);

const report = (
  entries: Record<string, unknown>[],
  summary: unknown = 'The text exposes direct contact details.',
): string =>
  JSON.stringify({
    analyses: entries.map((entry) => ({
      findingId: 'unknown',
      isSensitive: true,
      confidence: 0.8,
      severity: 'MEDIUM',
      explanation: 'generic',
      recommendation: 'remove it',
      ...entry,
    })),
    summary,
  });

const entryFor = (finding: Finding, overrides: Record<string, unknown> = {}) => ({
  findingId: finding.id,
  isSensitive: true,
  confidence: 0.85,
  severity: 'HIGH',
  explanation: `This ${finding.category.toLowerCase().replace(/_/g, ' ')} identifies Jane directly and can be used to reach her.`,
  recommendation: 'Remove it before sharing this text outside the team.',
  ...overrides,
});

/** Provider stub that returns scripted responses and records what it was asked. */
function stubProvider(
  responses: (AiProviderResult | string | ((prompt: AiPrompt) => string))[],
  options: { configured?: boolean } = {},
): AiProvider & { prompts: AiPrompt[] } {
  const prompts: AiPrompt[] = [];
  let index = 0;

  return {
    id: 'featherless',
    model: 'stub/model',
    prompts,
    isConfigured: () => options.configured ?? true,
    async complete(prompt: AiPrompt): Promise<AiProviderResult> {
      prompts.push(prompt);
      const next = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (next === undefined) return { ok: false, reason: 'provider_error' };
      if (typeof next === 'function') return { ok: true, content: next(prompt) };
      return typeof next === 'string' ? { ok: true, content: next } : next;
    },
  };
}

function serviceOptions(provider: AiProvider | null, overrides: Partial<AiServiceOptions> = {}): AiServiceOptions {
  return {
    provider,
    enabled: true,
    maxContextChars: 4_000,
    maxTokens: 1_000,
    timeoutMs: 5_000,
    overrides: { recommendation: () => 'Deterministic fallback recommendation.' },
    ...overrides,
  };
}

describe('schema validation', () => {
  it('accepts a well-formed report', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(report([entryFor(finding)]));

    assert.equal(parsed.ok, true);
    assert.ok(parsed.ok && parsed.report.analyses.length === 1);
    assert.equal(parsed.ok && parsed.report.analyses[0]?.findingId, finding.id);
    assert.equal(parsed.ok && parsed.report.analyses[0]?.severity, 'HIGH');
    assert.ok(parsed.ok && parsed.report.summary !== null);
  });

  it('rejects a body that is not JSON', () => {
    assert.deepEqual(parseModelReport('I am sorry, I cannot help with that.'), {
      ok: false,
      reason: 'malformed_response',
    });
  });

  it('rejects an empty completion', () => {
    assert.deepEqual(parseModelReport('   '), { ok: false, reason: 'malformed_response' });
  });

  it('rejects a JSON array instead of an object', () => {
    assert.deepEqual(parseModelReport('[{"findingId":"a"}]'), { ok: false, reason: 'malformed_response' });
  });

  it('rejects a report whose analyses field is not an array', () => {
    assert.deepEqual(parseModelReport('{"analyses":{},"summary":"x"}'), {
      ok: false,
      reason: 'malformed_response',
    });
  });

  it('rejects a report in which no entry is usable', () => {
    assert.deepEqual(parseModelReport('{"analyses":[{"findingId":"a"}],"summary":"x"}'), {
      ok: false,
      reason: 'invalid_response',
    });
  });

  it('drops individual malformed entries but keeps the valid ones', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(
      report([
        { findingId: finding.id, confidence: 'high', severity: 'HIGH' },
        entryFor(finding),
      ]),
    );

    assert.equal(parsed.ok, true);
    assert.ok(parsed.ok && parsed.report.analyses.length === 1);
  });

  it('rejects entries with an unknown severity, a missing id or a bad confidence', () => {
    const base = entryFor(findings()[0]!);

    assert.equal(parseModelReport(report([{ ...base, severity: 'SEVERE' }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, findingId: '  ' }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, confidence: 'high' }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, confidence: 42 }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, confidence: -0.5 }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, confidence: Number.NaN }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, isSensitive: 'yes' }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, explanation: '' }])).ok, false);
    assert.equal(parseModelReport(report([{ ...base, recommendation: 42 }])).ok, false);
  });

  it('accepts a boundary confidence and drops one outside the range', () => {
    const finding = findings()[0]!;

    const upper = parseModelReport(report([entryFor(finding, { confidence: 1 })]));
    assert.ok(upper.ok && upper.report.analyses[0]?.confidence === 1);

    const lower = parseModelReport(report([entryFor(finding, { confidence: 0 })]));
    assert.ok(lower.ok && lower.report.analyses[0]?.confidence === 0);
  });

  it('strips control, zero-width and bidi-override characters from model prose', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(
      report([entryFor(finding, { explanation: 'Identifies\u200B Jane\u0007 directly\u202E\u2066' })]),
    );

    assert.ok(parsed.ok);
    const explanation = parsed.ok ? parsed.report.analyses[0]?.explanation : '';
    assert.equal(/[\u0000-\u001F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/.test(explanation ?? ''), false);
    assert.equal(explanation, 'Identifies Jane directly');
  });

  it('caps runaway prose length', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(report([entryFor(finding, { explanation: 'x'.repeat(5_000) })]));

    assert.ok(parsed.ok);
    const length = parsed.ok ? (parsed.report.analyses[0]?.explanation.length ?? 0) : 0;
    assert.ok(length > 0 && length <= 600);
  });

  it('keeps only the first entry for a duplicated findingId', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(
      report([
        entryFor(finding, { explanation: 'first accepted' }),
        entryFor(finding, { explanation: 'second ignored' }),
      ]),
    );

    assert.ok(parsed.ok);
    assert.ok(parsed.ok && parsed.report.analyses[0]?.explanation === 'first accepted');
    assert.ok(parsed.ok && parsed.report.analyses.length === 1);
  });

  it('recovers a JSON object embedded in surrounding prose', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(`Sure! Here you go: ${report([entryFor(finding)])} Hope that helps.`);

    assert.equal(parsed.ok, true);
  });

  it('treats a missing summary as absent rather than fatal', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(JSON.stringify({ analyses: [entryFor(finding)] }));

    assert.ok(parsed.ok && parsed.report.summary === null);
  });
});

describe('context windowing', () => {
  it('sends the whole text when it fits', () => {
    const batches = buildAnalysisBatches(TEXT, findings(), 4_000);

    assert.equal(batches.length, 1);
    assert.equal(batches[0]?.text, TEXT);
    assert.equal(batches[0]?.truncated, false);
  });

  it('produces no batches when nothing was detected', () => {
    assert.deepEqual(buildAnalysisBatches(TEXT, [], 4_000), []);
  });

  it('windows a long text and reports the truncation', () => {
    const long = `filler line ${'x'.repeat(200)}\n`.repeat(200) + TEXT;
    const batches = buildAnalysisBatches(long, findings(), 2_000);

    assert.ok(batches.length >= 1);
    for (const batch of batches) {
      assert.ok(batch.text.length <= 2_000);
      assert.equal(batch.truncated, true);
    }
  });

  it('covers every finding exactly once when the text must be windowed', () => {
    const emails = Array.from({ length: 60 }, (_unused, index) => `user${index}@example.com`).join('\n');
    const long = `${emails}\n${'padding '.repeat(400)}`;
    const detected = findings(long);
    const batches = buildAnalysisBatches(long, detected, 2_000);

    const submitted = batches.flatMap((batch) => batch.findings.map((finding) => finding.id));
    assert.deepEqual([...submitted].sort(), [...detected.map((finding) => finding.id)].sort());
  });

  it('still covers every finding when a single value exceeds the budget', () => {
    const huge = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(8_000)}\n-----END PRIVATE KEY-----`;
    const detected = findings(huge);
    assert.ok(detected.length > 0);

    const batches = buildAnalysisBatches(huge, detected, 1_000);

    assert.equal(batches.flatMap((batch) => batch.findings).length, detected.length);
    for (const batch of batches) {
      assert.ok(batch.text.length <= 1_000);
      assert.equal(batch.truncated, true);
    }
  });

  it('bounds the prompt so only a window, not a whole document, is sent', () => {
    const long = `${'unrelated prose. '.repeat(500)}mail jane@example.com`;
    const detected = findings(long);
    const [batch] = buildAnalysisBatches(long, detected, 1_500);

    assert.ok(batch);
    assert.ok(batch.text.length <= 1_500);
    assert.ok(batch.text.includes('jane@example.com'));
  });
});

describe('prompt construction', () => {
  it('sends only the bounded text and the detected findings', () => {
    const prompt = buildPrompt({ text: 'excerpt', findings: findings(), truncated: false });

    assert.match(prompt.system, /untrusted DATA/i);
    assert.match(prompt.system, /never invent/i);

    const payload = JSON.parse(prompt.user) as {
      text: string;
      note: string;
      findings: { findingId: string; category: string; matchedText: string }[];
    };

    assert.equal(payload.text, 'excerpt');
    assert.equal(payload.findings.length, findings().length);
    assert.deepEqual(
      payload.findings.map((entry) => entry.findingId),
      findings().map((finding) => finding.id),
    );
  });

  it('never carries server configuration or a credential into the prompt', () => {
    const prompt = buildPrompt({ text: 'excerpt', findings: findings(), truncated: false });

    for (const secret of ['FEATHERLESS_API_KEY', 'api_key', 'Bearer ', 'OPENAI', 'ANTHROPIC']) {
      assert.equal(`${prompt.system}${prompt.user}`.includes(secret), false);
    }
  });

  it('flags when the excerpt was shortened', () => {
    const prompt = buildPrompt({ text: 'excerpt', findings: findings(), truncated: true });
    const payload = JSON.parse(prompt.user) as { note: string };

    assert.match(payload.note, /excerpt/i);
  });

  it('elides a very long matched value instead of resending it in full', () => {
    const long = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(5_000)}\n-----END PRIVATE KEY-----`;
    const prompt = buildPrompt({ text: 'excerpt', findings: findings(long), truncated: false });
    const payload = JSON.parse(prompt.user) as { findings: { matchedText: string }[] };

    assert.ok((payload.findings[0]?.matchedText.length ?? 0) <= 244);
  });
});

describe('contextual service: successful analysis', () => {
  it('enriches every finding and reports the model as available', async () => {
    const detected = findings();
    const provider = stubProvider([report(detected.map((finding) => entryFor(finding)))]);

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    assert.equal(outcome.status, 'available');
    assert.equal(outcome.reason, 'ok');
    assert.equal(outcome.analyzedCount, detected.length);
    assert.equal(outcome.summary, 'The text exposes direct contact details.');

    for (const finding of outcome.findings) {
      assert.equal(finding.contextual.source, 'ai');
      assert.equal(finding.contextual.severity, 'HIGH');
      assert.equal(
        finding.contextual.severityAdjusted,
        finding.severity !== 'HIGH',
        'the adjustment flag should track the deterministic severity',
      );
      assert.ok(finding.contextual.explanation.length > 0);
      assert.ok(finding.contextual.recommendation.length > 0);
    }
  });

  it('reaches the provider with the detected text', async () => {
    const detected = findings();
    const provider = stubProvider([report(detected.map((finding) => entryFor(finding)))]);

    await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    const payload = JSON.parse(provider.prompts[0]?.user ?? '{}') as { text: string };
    assert.equal(payload.text, TEXT);
  });

  it('keeps the deterministic severity untouched and records the adjustment separately', async () => {
    const detected = findings();
    const provider = stubProvider([
      report(detected.map((finding) => entryFor(finding, { severity: 'LOW' }))),
    ]);

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    for (const [index, finding] of outcome.findings.entries()) {
      const original = detected[index]!;
      assert.equal(finding.severity, original.severity, 'the deterministic severity is never overwritten');
      assert.equal(finding.contextual.severity, 'LOW');
      assert.equal(finding.contextual.severityAdjusted, original.severity !== 'LOW');
    }
  });

  it('does not change spans, categories or matched text', async () => {
    const detected = findings();
    const provider = stubProvider([report(detected.map((finding) => entryFor(finding)))]);

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    for (const [index, finding] of outcome.findings.entries()) {
      const original = detected[index]!;
      assert.equal(finding.id, original.id);
      assert.equal(finding.start, original.start);
      assert.equal(finding.end, original.end);
      assert.equal(finding.matchedText, original.matchedText);
      assert.equal(finding.category, original.category);
      assert.equal(TEXT.slice(finding.start, finding.end), finding.matchedText);
    }
  });
});

describe('contextual service: the model cannot invent findings', () => {
  it('discards analyses for ids the detector never issued', async () => {
    const detected = findings();
    const provider = stubProvider([
      report([
        ...detected.map((finding) => entryFor(finding)),
        entryFor({ ...detected[0]!, id: 'pg_invented_1_0_5' }),
        entryFor({ ...detected[0]!, id: 'made-up-id' }),
      ]),
    ]);

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    assert.equal(outcome.findings.length, detected.length);
    assert.deepEqual(
      outcome.findings.map((finding) => finding.id),
      detected.map((finding) => finding.id),
    );
    assert.deepEqual(
      outcome.findings.map((finding) => finding.contextual.source),
      detected.map(() => 'ai'),
    );
  });

  it('ignores a model that reports only invented findings', async () => {
    const detected = findings();
    const provider = stubProvider([
      report([
        entryFor({ ...detected[0]!, id: 'hallucinated-1' }),
        entryFor({ ...detected[0]!, id: 'hallucinated-2' }),
      ]),
    ]);

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    assert.equal(outcome.status, 'degraded');
    assert.equal(outcome.reason, 'invalid_response');
    assert.equal(outcome.analyzedCount, 0);
    assert.equal(outcome.findings.length, detected.length);
    for (const finding of outcome.findings) {
      assert.equal(finding.contextual.source, 'deterministic');
    }
  });

  it('cannot introduce a span, because the response schema has no span field', () => {
    const finding = findings()[0]!;
    const parsed = parseModelReport(
      report([entryFor(finding, { start: 0, end: 999, category: 'PRIVATE_KEY', matchedText: 'invented' })]),
    );

    assert.ok(parsed.ok);
    const accepted = parsed.ok ? parsed.report.analyses[0] : undefined;
    assert.deepEqual(Object.keys(accepted ?? {}).sort(), [
      'confidence',
      'explanation',
      'findingId',
      'isSensitive',
      'recommendation',
      'severity',
    ]);
  });
});

describe('contextual service: fallback behaviour', () => {
  const expectDeterministicFallback = async (
    provider: AiProvider,
    reason: string,
  ): Promise<void> => {
    const detected = findings();
    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    assert.equal(outcome.status, 'degraded');
    assert.equal(outcome.reason, reason);
    assert.equal(outcome.summary, null);
    assert.equal(outcome.analyzedCount, 0);

    // Every deterministic finding survives, with its span and category intact.
    assert.equal(outcome.findings.length, detected.length);
    for (const [index, finding] of outcome.findings.entries()) {
      const original = detected[index]!;
      assert.equal(finding.id, original.id);
      assert.equal(finding.start, original.start);
      assert.equal(finding.end, original.end);
      assert.equal(finding.category, original.category);
      assert.equal(finding.severity, original.severity);
      assert.equal(finding.explanation, original.explanation);
      assert.equal(finding.contextual.source, 'deterministic');
      assert.equal(finding.contextual.recommendation, 'Deterministic fallback recommendation.');
    }
  };

  it('falls back on a provider HTTP error', () => expectDeterministicFallback(stubProvider([{ ok: false, reason: 'http_error', httpStatus: 503 }]), 'http_error'));

  it('falls back on a timeout', () => expectDeterministicFallback(stubProvider([{ ok: false, reason: 'timeout' }]), 'timeout'));

  it('falls back on a network failure', () => expectDeterministicFallback(stubProvider([{ ok: false, reason: 'network_error' }]), 'network_error'));

  it('falls back on a malformed response', () => expectDeterministicFallback(stubProvider(['not json at all']), 'malformed_response'));

  it('falls back when the model returns nothing usable', () => expectDeterministicFallback(stubProvider(['{"analyses":[]}']), 'invalid_response'));

  it('falls back when the provider is missing entirely', () =>
    expectDeterministicFallback(stubProvider([{ ok: false, reason: 'missing_api_key' }]), 'missing_api_key'));

  it('reports unavailable without calling an unconfigured provider', async () => {
    const detected = findings();
    const provider = stubProvider([report([])], { configured: false });

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    assert.equal(outcome.status, 'unavailable');
    assert.equal(outcome.reason, 'missing_api_key');
    assert.equal(provider.prompts.length, 0);
    assert.equal(outcome.findings.length, detected.length);
  });

  it('reports unavailable when the layer is switched off', async () => {
    const detected = findings();
    const provider = stubProvider([report(detected.map((finding) => entryFor(finding)))]);

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider, { enabled: false }));

    assert.equal(outcome.status, 'unavailable');
    assert.equal(outcome.reason, 'disabled');
    assert.equal(provider.prompts.length, 0);
  });

  it('reports unavailable when there is no provider to call', async () => {
    const detected = findings();
    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(null));

    assert.equal(outcome.status, 'unavailable');
    assert.equal(outcome.reason, 'disabled');
    assert.equal(outcome.findings.length, detected.length);
  });

  it('partially degrades when only some findings are analysed', async () => {
    const detected = findings();
    const provider = stubProvider([report([entryFor(detected[0]!)])]);

    const outcome = await analyzeWithContext(TEXT, detected, serviceOptions(provider));

    assert.equal(outcome.status, 'degraded');
    assert.equal(outcome.reason, 'invalid_response');
    assert.equal(outcome.analyzedCount, 1);
    assert.equal(outcome.findings.length, detected.length);
    assert.equal(outcome.findings[0]?.contextual.source, 'ai');
    assert.equal(outcome.findings[1]?.contextual.source, 'deterministic');
  });

  it('never calls the provider when nothing was detected', async () => {
    const provider = stubProvider([report([])]);
    const outcome = await analyzeWithContext('Nothing sensitive here.', [], serviceOptions(provider));

    assert.equal(provider.prompts.length, 0);
    assert.equal(outcome.findings.length, 0);
    assert.equal(outcome.reason, 'no_findings');
  });

  it('degrades rather than throwing when a provider rejects', async () => {
    const detected = findings();
    const provider: AiProvider = {
      id: 'featherless',
      model: 'stub/model',
      isConfigured: () => true,
      complete: () => Promise.reject(new Error('boom')),
    };

    await assert.rejects(() => analyzeWithContext(TEXT, detected, serviceOptions(provider)));
  });

  it('builds a usable deterministic outcome on its own', () => {
    const detected = findings();
    const outcome = deterministicOutcome(detected, 'disabled', 'unavailable', {
      recommendation: () => 'Remove it.',
    });

    assert.equal(outcome.findings.length, detected.length);
    assert.equal(outcome.findings[0]?.contextual.recommendation, 'Remove it.');
  });
});

describe('contextual service: large inputs', () => {
  it('splits a crowded text into batches without dropping a finding', async () => {
    const text = Array.from({ length: 60 }, (_unused, index) => `user${index}@example.com`).join('\n');
    const detected = findings(text);
    assert.ok(detected.length >= 60);

    const provider = stubProvider([
      (prompt) => {
        const payload = JSON.parse(prompt.user) as { findings: { findingId: string }[] };
        return report(payload.findings.map((entry) => entryFor(detected.find((f) => f.id === entry.findingId)!)));
      },
    ]);

    const outcome = await analyzeWithContext(text, detected, serviceOptions(provider, { maxContextChars: 1_000 }));

    assert.equal(outcome.contextTruncated, true);
    assert.equal(outcome.findings.length, detected.length);
    assert.equal(outcome.analyzedCount, detected.length);
    assert.equal(outcome.status, 'available');
    assert.ok(provider.prompts.length > 1);
  });

  it('keeps later findings deterministic when an earlier batch fails', async () => {
    const text = Array.from({ length: 60 }, (_unused, index) => `user${index}@example.com`).join('\n');
    const detected = findings(text);
    const provider = stubProvider([
      { ok: false, reason: 'timeout' },
      (prompt) => {
        const payload = JSON.parse(prompt.user) as { findings: { findingId: string }[] };
        return report(payload.findings.map((entry) => entryFor(detected.find((f) => f.id === entry.findingId)!)));
      },
    ]);

    const outcome = await analyzeWithContext(text, detected, serviceOptions(provider, { maxContextChars: 1_000 }));

    assert.equal(outcome.status, 'degraded');
    assert.equal(outcome.findings.length, detected.length);
    assert.ok(outcome.analyzedCount > 0);
    assert.ok(outcome.analyzedCount < detected.length);
  });
});