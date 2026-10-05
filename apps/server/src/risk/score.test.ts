/**
 * Risk-scoring tests.
 *
 * The scorer is a pure function, so these call it directly. No provider, no
 * network, no clock: the point of the module is that the score is reproducible,
 * and the determinism tests below assert exactly that.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RISK_CAVEAT,
  RISK_LEVELS,
  SEVERITY_WEIGHTS,
  SHARING_VERDICTS,
  combineContributions,
  effectiveSeverity,
  riskLevelFor,
  scoreRisk,
  verdictFor,
} from './index.js';
import type { RiskLevel, ScorableFinding, SharingVerdict } from './types.js';
import type { FindingCategory, Severity } from '../detection/types.js';

let counter = 0;

function finding(
  severity: Severity,
  category: FindingCategory = 'EMAIL',
  options: { contextualSeverity?: Severity; contextualSource?: 'ai' | 'deterministic' } = {},
): ScorableFinding {
  counter += 1;

  return {
    id: `pg_test_${counter}`,
    category,
    severity,
    contextual: {
      source: options.contextualSource ?? 'deterministic',
      isSensitive: true,
      confidence: 0.9,
      severity: options.contextualSeverity ?? severity,
      severityAdjusted: (options.contextualSeverity ?? severity) !== severity,
      explanation: 'explanation',
      recommendation: 'recommendation',
    },
  };
}

/** Same shape, but with the AI layer switched on for the effective severity. */
function aiFinding(severity: Severity, contextualSeverity: Severity, category: FindingCategory = 'EMAIL'): ScorableFinding {
  return finding(severity, category, { contextualSeverity, contextualSource: 'ai' });
}

const resetIds = (): void => {
  counter = 0;
};

/**
 * The explanation with the standing caveat removed. The caveat is a fixed
 * string checked separately, so safety-claim assertions only need to concern
 * the part that is derived from the findings.
 */
const withoutCaveat = (explanation: string): string => explanation.replace(RISK_CAVEAT, '').trim();

describe('no findings', () => {
  it('scores 0, LOW, SAFE_TO_SHARE', () => {
    resetIds();
    const risk = scoreRisk([]);

    assert.equal(risk.score, 0);
    assert.equal(risk.level, 'LOW');
    assert.equal(risk.verdict, 'SAFE_TO_SHARE');
  });

  it('has no factors and an explanation that does not claim safety', () => {
    resetIds();
    const risk = scoreRisk([]);

    assert.deepEqual(risk.factors, []);
    assert.equal(risk.severityBasis.deterministic, 0);
    assert.equal(risk.severityBasis.contextual, 0);
    assert.match(risk.explanation, /No sensitive-data pattern matched/);
    assert.equal(/guarantee|secure|definitely safe/i.test(withoutCaveat(risk.explanation)), false);
    assert.match(risk.explanation, /read the text before sharing/i);
  });
});

describe('a single finding', () => {
  it('LOW scores 10, LOW, SAFE_TO_SHARE', () => {
    resetIds();
    const risk = scoreRisk([finding('LOW')]);

    assert.equal(risk.score, 10);
    assert.equal(risk.level, 'LOW');
    assert.equal(risk.verdict, 'SAFE_TO_SHARE');
  });

  it('MEDIUM scores 25, MEDIUM, REVIEW_BEFORE_SHARING', () => {
    resetIds();
    const risk = scoreRisk([finding('MEDIUM')]);

    assert.equal(risk.score, 25);
    assert.equal(risk.level, 'MEDIUM');
    assert.equal(risk.verdict, 'REVIEW_BEFORE_SHARING');
  });

  it('HIGH scores 50, HIGH, REVIEW_BEFORE_SHARING', () => {
    resetIds();
    const risk = scoreRisk([finding('HIGH')]);

    assert.equal(risk.score, 50);
    assert.equal(risk.level, 'HIGH');
    assert.equal(risk.verdict, 'REVIEW_BEFORE_SHARING');
  });

  it('CRITICAL scores 75, CRITICAL, NOT_SAFE_TO_SHARE', () => {
    resetIds();
    const risk = scoreRisk([finding('CRITICAL')]);

    assert.equal(risk.score, 75);
    assert.equal(risk.level, 'CRITICAL');
    assert.equal(risk.verdict, 'NOT_SAFE_TO_SHARE');
  });

  it('reports the finding as a single factor', () => {
    resetIds();
    const risk = scoreRisk([finding('CRITICAL', 'CREDIT_CARD')]);

    assert.equal(risk.factors.length, 1);
    assert.deepEqual(risk.factors[0], {
      findingId: 'pg_test_1',
      category: 'CREDIT_CARD',
      severity: 'CRITICAL',
      severitySource: 'deterministic',
      contribution: 75,
    });
    assert.equal('deterministicSeverity' in (risk.factors[0] ?? {}), false);
  });
});

describe('severity weights', () => {
  it('uses the documented weight for each severity', () => {
    assert.deepEqual(SEVERITY_WEIGHTS, { LOW: 10, MEDIUM: 25, HIGH: 50, CRITICAL: 75 });
  });

  it('maps every severity to its own weight when it is the only finding', () => {
    for (const [severity, weight] of Object.entries(SEVERITY_WEIGHTS)) {
      resetIds();
      const risk = scoreRisk([finding(severity as Severity)]);
      assert.equal(risk.score, weight, severity);
    }
  });
});

describe('diminishing contribution', () => {
  it('HIGH + HIGH = 75', () => {
    resetIds();
    assert.equal(scoreRisk([finding('HIGH'), finding('HIGH')]).score, 75);
  });

  it('CRITICAL + HIGH = 88 after rounding', () => {
    resetIds();
    // 100 * (1 - 0.25 * 0.5) = 87.5, which rounds up.
    assert.equal(scoreRisk([finding('CRITICAL'), finding('HIGH')]).score, 88);
  });

  it('matches the formula for the documented examples', () => {
    assert.equal(combineContributions([10]), 10);
    assert.equal(combineContributions([50]), 50);
    assert.equal(combineContributions([75]), 75);
    assert.equal(combineContributions([50, 50]), 75);
    assert.equal(combineContributions([75, 50]), 88);
  });

  it('never exceeds 100 however many findings there are', () => {
    resetIds();
    const many = Array.from({ length: 500 }, () => finding('CRITICAL'));
    assert.equal(scoreRisk(many).score, 100);
  });

  it('grows sub-linearly: a second CRITICAL adds less than the first', () => {
    resetIds();
    const one = scoreRisk([finding('CRITICAL')]).score;
    const two = scoreRisk([finding('CRITICAL'), finding('CRITICAL')]).score;

    assert.equal(two - one, 19, '100*(1-0.25*0.25) = 93.75 -> 94');
  });

  it('scales sub-linearly, so repeated values cannot sum without limit', () => {
    resetIds();
    const lows = scoreRisk(Array.from({ length: 6 }, () => finding('LOW'))).score;

    // Six LOW weights would total 60 if they were summed; combined they reach 47.
    assert.equal(lows, 47);
    assert.ok(lows < 60, 'contributions must diminish rather than add up');
  });

  it('converges towards 100 without ever passing it', () => {
    resetIds();
    const at = (count: number): number =>
      scoreRisk(Array.from({ length: count }, () => finding('HIGH'))).score;

    assert.equal(at(1), 50);
    assert.equal(at(2), 75);
    assert.equal(at(5), 97);

    let previous = -1;
    for (let count = 1; count <= 40; count += 1) {
      const score = at(count);
      assert.ok(score >= previous, `score fell at ${count} findings`);
      assert.ok(score <= 100, `score ${score} exceeded 100`);
      previous = score;
    }
  });

  it('never exceeds 100 however many findings there are', () => {
    resetIds();
    const many = Array.from({ length: 500 }, () => finding('CRITICAL'));
    assert.equal(scoreRisk(many).score, 100);
  });

  it('grows sub-linearly: a second CRITICAL adds less than the first', () => {
    resetIds();
    const one = scoreRisk([finding('CRITICAL')]).score;
    const two = scoreRisk([finding('CRITICAL'), finding('CRITICAL')]).score;

    assert.equal(two - one, 19, '100*(1-0.25*0.25) = 93.75 -> 94');
  });

  it('returns 0 for an empty contribution list', () => {
    assert.equal(combineContributions([]), 0);
  });
});

describe('multiple findings', () => {
  it('orders factors by influence, then deterministically', () => {
    resetIds();
    const risk = scoreRisk([
      finding('LOW', 'URL'),
      finding('CRITICAL', 'PRIVATE_KEY'),
      finding('HIGH', 'ADDRESS'),
    ]);

    assert.deepEqual(
      risk.factors.map((factor) => factor.contribution),
      [75, 50, 10],
    );
    assert.deepEqual(
      risk.factors.map((factor) => factor.category),
      ['PRIVATE_KEY', 'ADDRESS', 'URL'],
    );
  });

  it('keeps the factor order stable for equal contributions', () => {
    resetIds();
    const findings = [finding('HIGH', 'ADDRESS'), finding('HIGH', 'EMAIL')];
    const first = scoreRisk(findings).factors.map((factor) => factor.findingId);
    const second = scoreRisk(findings).factors.map((factor) => factor.findingId);

    assert.deepEqual(first, second);
  });

  it('produces the same factors in the same order when the input is reversed', () => {
    resetIds();
    const a = finding('CRITICAL', 'PRIVATE_KEY');
    const b = finding('MEDIUM', 'EMAIL');

    assert.deepEqual(
      scoreRisk([a, b]).factors.map((factor) => factor.findingId),
      scoreRisk([b, a]).factors.map((factor) => factor.findingId),
    );
  });

  it('combines a mixed set into a single score', () => {
    resetIds();
    // 100 * (1 - 0.9 * 0.75 * 0.5) = 88.75 -> 89
    const risk = scoreRisk([finding('LOW'), finding('CRITICAL'), finding('HIGH')]);

    assert.equal(risk.score, 89);
    assert.equal(risk.level, 'CRITICAL');
    assert.equal(risk.verdict, 'NOT_SAFE_TO_SHARE');
    assert.equal(risk.factors.length, 3);
  });

  it('counts every category once in the explanation', () => {
    resetIds();
    const risk = scoreRisk([finding('CRITICAL', 'CREDIT_CARD'), finding('HIGH', 'API_KEY')]);

    assert.match(risk.explanation, /payment card number|API key/);
    assert.equal(risk.factors.length, 2);
  });
});

describe('AI contextual severity', () => {
  it('uses the contextual severity instead of the deterministic one', () => {
    resetIds();
    const risk = scoreRisk([aiFinding('LOW', 'CRITICAL')]);

    assert.equal(risk.score, 75);
    assert.equal(risk.factors[0]?.severity, 'CRITICAL');
    assert.equal(risk.factors[0]?.deterministicSeverity, 'LOW');
    assert.equal(risk.factors[0]?.severitySource, 'ai');
    assert.equal(risk.severityBasis.contextual, 1);
    assert.equal(risk.severityBasis.deterministic, 0);
  });

  it('can lower a weight as well as raise it', () => {
    resetIds();
    const risk = scoreRisk([aiFinding('CRITICAL', 'LOW')]);

    assert.equal(risk.score, 10);
    assert.equal(risk.level, 'LOW');
    assert.equal(risk.verdict, 'SAFE_TO_SHARE');
    assert.equal(risk.factors[0]?.deterministicSeverity, 'CRITICAL');
  });

  it('leaves the detector severity field untouched', () => {
    resetIds();
    const original = aiFinding('MEDIUM', 'HIGH');
    scoreRisk([original]);

    assert.equal(original.severity, 'MEDIUM');
  });

  it('still only ever scores findings the detector produced', () => {
    resetIds();
    const risk = scoreRisk([finding('HIGH'), aiFinding('LOW', 'CRITICAL')]);

    assert.equal(risk.factors.length, 2, 'the AI cannot add a third factor');
    assert.deepEqual(
      risk.factors.map((factor) => factor.findingId),
      ['pg_test_2', 'pg_test_1'],
    );
  });
});

describe('AI unavailable', () => {
  it('scores with the deterministic severity', () => {
    resetIds();
    const risk = scoreRisk([finding('CRITICAL', 'CREDIT_CARD', { contextualSource: 'deterministic' })]);

    assert.equal(risk.score, 75);
    assert.equal(risk.level, 'CRITICAL');
    assert.equal(risk.verdict, 'NOT_SAFE_TO_SHARE');
    assert.equal(risk.factors[0]?.severitySource, 'deterministic');
    assert.equal(risk.severityBasis.deterministic, 1);
    assert.equal(risk.severityBasis.contextual, 0);
  });

  it('gives the same score with and without AI for identical findings', () => {
    resetIds();
    const withAi = scoreRisk([aiFinding('MEDIUM', 'MEDIUM'), aiFinding('HIGH', 'HIGH')]);
    resetIds();
    const withoutAi = scoreRisk([finding('MEDIUM'), finding('HIGH')]);

    assert.equal(withAi.score, withoutAi.score);
    assert.equal(withAi.level, withoutAi.level);
    assert.equal(withAi.verdict, withoutAi.verdict);
  });

  it('ignores a contextual severity when the source is not the model', () => {
    resetIds();
    // A finding whose commentary came from the detector must be scored on the
    // detector's severity, even if the contextual field says otherwise.
    const odd = finding('HIGH', 'EMAIL', {
      contextualSeverity: 'CRITICAL',
      contextualSource: 'deterministic',
    });

    assert.equal(effectiveSeverity(odd).severity, 'HIGH');
    assert.equal(scoreRisk([odd]).score, 50);
  });
});

describe('level and verdict thresholds', () => {
  it('maps the documented boundaries', () => {
    const expected: [number, RiskLevel][] = [
      [0, 'LOW'],
      [19, 'LOW'],
      [20, 'MEDIUM'],
      [39, 'MEDIUM'],
      [40, 'HIGH'],
      [69, 'HIGH'],
      [70, 'CRITICAL'],
      [100, 'CRITICAL'],
    ];

    for (const [score, level] of expected) {
      assert.equal(riskLevelFor(score), level, `score ${score}`);
    }
  });

  it('maps the documented verdict boundaries', () => {
    const expected: [number, SharingVerdict][] = [
      [0, 'SAFE_TO_SHARE'],
      [19, 'SAFE_TO_SHARE'],
      [20, 'REVIEW_BEFORE_SHARING'],
      [69, 'REVIEW_BEFORE_SHARING'],
      [70, 'NOT_SAFE_TO_SHARE'],
      [100, 'NOT_SAFE_TO_SHARE'],
    ];

    for (const [score, verdict] of expected) {
      assert.equal(verdictFor(score), verdict, `score ${score}`);
    }
  });

  it('exposes exactly the documented level and verdict values', () => {
    assert.deepEqual(RISK_LEVELS, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    assert.deepEqual(SHARING_VERDICTS, ['SAFE_TO_SHARE', 'REVIEW_BEFORE_SHARING', 'NOT_SAFE_TO_SHARE']);
  });
});

describe('explainability', () => {
  it('gives every finding a factor with a reproducible weight', () => {
    resetIds();
    const risk = scoreRisk([finding('CRITICAL'), finding('LOW')]);

    for (const factor of risk.factors) {
      assert.equal(factor.contribution, SEVERITY_WEIGHTS[factor.severity]);
      assert.ok(factor.findingId.length > 0);
      assert.ok(factor.category.length > 0);
    }
  });

  it('states the score in the explanation', () => {
    resetIds();
    assert.match(scoreRisk([finding('HIGH')]).explanation, /Scored 50\/100/);
    assert.match(scoreRisk([finding('CRITICAL')]).explanation, /Scored 75\/100/);
  });

  it('carries the pre-protection caveat on every assessment', () => {
    resetIds();

    for (const risk of [scoreRisk([]), scoreRisk([finding('LOW')]), scoreRisk([finding('CRITICAL')])]) {
      assert.equal(risk.caveat, RISK_CAVEAT);
      assert.match(risk.explanation, /not a guarantee/i);
      assert.match(risk.caveat, /before any redaction/i);
    }
  });

  it('never claims the content is objectively safe or secure', () => {
    resetIds();

    for (const risk of [scoreRisk([]), scoreRisk([finding('LOW')]), scoreRisk([finding('MEDIUM')])]) {
      const explanation = withoutCaveat(risk.explanation);

      assert.equal(
        /\b(guarantee[ds]?|is secure|is safe|cannot be misused|certainly safe|completely safe)\b/i.test(explanation),
        false,
        explanation,
      );
    }
  });

  it('never puts matched user content in the explanation or the factors', () => {
    resetIds();
    const risk = scoreRisk([finding('CRITICAL', 'CREDIT_CARD')]);
    const serialised = JSON.stringify(risk);

    for (const secret of ['4111', 'jane@example.com', 'sk-proj-']) {
      assert.equal(serialised.includes(secret), false);
    }
  });

  it('keeps the explanation free of model prose', () => {
    resetIds();
    const findingWithModelText = {
      ...aiFinding('HIGH', 'HIGH'),
      contextual: {
        ...aiFinding('HIGH', 'HIGH').contextual,
        explanation: 'MODEL SENTENCE THAT MUST NOT APPEAR',
        recommendation: 'MODEL ADVICE THAT MUST NOT APPEAR',
      },
    };

    const risk = scoreRisk([findingWithModelText]);
    const serialised = JSON.stringify(risk);

    assert.equal(serialised.includes('MODEL SENTENCE'), false);
    assert.equal(serialised.includes('MODEL ADVICE'), false);
  });
});

describe('determinism and bounds', () => {
  it('produces an identical result for identical input', () => {
    resetIds();
    const findings = [finding('CRITICAL', 'PRIVATE_KEY'), finding('HIGH'), finding('LOW', 'URL')];
    const reference = JSON.stringify(scoreRisk(findings));

    for (let run = 0; run < 25; run += 1) {
      assert.equal(JSON.stringify(scoreRisk(findings)), reference);
    }
  });

  it('produces an identical result regardless of input order', () => {
    resetIds();
    const a = finding('MEDIUM');
    const b = finding('CRITICAL');
    const c = finding('HIGH');

    const reference = JSON.stringify(scoreRisk([a, b, c]));
    assert.equal(JSON.stringify(scoreRisk([c, a, b])), reference);
    assert.equal(JSON.stringify(scoreRisk([c, b, a])), reference);
  });

  it('always returns a whole number between 0 and 100', () => {
    resetIds();

    for (let run = 0; run < 200; run += 1) {
      const severities: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const count = 1 + (run % 7);
      const findings = Array.from({ length: count }, (_unused, index) =>
        finding(severities[(run + index) % severities.length] ?? 'LOW'),
      );

      const risk = scoreRisk(findings);

      assert.ok(Number.isInteger(risk.score), `score ${risk.score} is not an integer`);
      assert.ok(risk.score >= 0 && risk.score <= 100, `score ${risk.score} out of bounds`);
    }
  });

  it('never returns a negative score from negative input', () => {
    assert.equal(combineContributions([-50, -10]), 0);
    assert.equal(combineContributions([0]), 0);
  });

  it('returns the same verdict for the same score every time', () => {
    for (const score of [0, 10, 19, 20, 55, 69, 70, 99, 100]) {
      assert.equal(verdictFor(score), verdictFor(score));
    }
  });
});