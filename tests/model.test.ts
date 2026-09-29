import { describe, expect, it } from 'vitest';
import {
  compare,
  limits,
  parseScenario,
  sample,
  simulate,
  validate,
  type Scenario,
} from '../src/model';
const fixture = (patch: Partial<Scenario> = {}): Scenario => ({
  ...sample,
  clients: 1,
  ...patch,
});
describe('timing and stopping rules', () => {
  it('matches hand-calculated exponential starts', () => {
    const r = simulate(fixture(), 'backoff');
    expect(r.attempts.map((a) => a.startMs)).toEqual([0, 600, 1700, 3800]);
    expect(r.clients[0]).toEqual({
      client: 1,
      outcome: 'success',
      finishedMs: 3900,
      elapsedMs: 3900,
      attempts: 4,
    });
  });
  it('caps the delay on later attempts', () => {
    expect(
      simulate(
        fixture({ outageMs: 10000, capMs: 500 }),
        'backoff',
      ).attempts.map((a) => a.startMs),
    ).toEqual([0, 600, 1200, 1800, 2400, 3000]);
  });
  it('succeeds immediately without an outage', () => {
    const r = simulate(fixture({ outageMs: 0 }), 'jitter');
    expect(r.successes).toBe(1);
    expect(r.amplification).toBe(1);
    expect(r.peakRetries).toBe(0);
    expect(r.p95SuccessMs).toBe(100);
  });
  it('uses request start to decide the response', () => {
    const r = simulate(fixture({ outageMs: 50 }), 'backoff');
    expect(r.attempts[0].response).toBe('503');
    expect(r.attempts[1].response).toBe('200');
  });
  it('accepts a start exactly at recovery', () => {
    expect(
      simulate(fixture({ outageMs: 600 }), 'backoff').attempts[1].response,
    ).toBe('200');
  });
  it('counts the initial attempt in the maximum', () => {
    const r = simulate(fixture({ maxAttempts: 1 }), 'backoff');
    expect(r.exhausted).toBe(1);
    expect(r.attempts).toHaveLength(1);
    expect(r.p95SuccessMs).toBeNull();
  });
  it('allows a success completing exactly at the deadline', () => {
    expect(
      simulate(fixture({ outageMs: 0, deadlineMs: 100 }), 'backoff').successes,
    ).toBe(1);
  });
  it('cancels an in-flight attempt crossing the deadline', () => {
    const r = simulate(fixture({ outageMs: 0, deadlineMs: 99 }), 'jitter');
    expect(r.attempts[0]).toMatchObject({ endMs: 99, response: 'deadline' });
    expect(r.deadlines).toBe(1);
  });
  it('does not start at the deadline', () => {
    const r = simulate(fixture({ deadlineMs: 600 }), 'backoff');
    expect(r.attempts).toHaveLength(1);
    expect(r.clients[0].finishedMs).toBe(600);
    expect(r.deadlines).toBe(1);
  });
  it('deadline at failed response takes priority over attempt exhaustion', () => {
    expect(
      simulate(fixture({ deadlineMs: 100, maxAttempts: 1 }), 'backoff')
        .deadlines,
    ).toBe(1);
  });
  it('applies Retry-After after response and beyond the cap', () => {
    const r = simulate(fixture({ retryAfterMs: 6000 }), 'backoff');
    expect(r.attempts[1]).toMatchObject({ startMs: 6100, waitMs: 6000 });
  });
  it('uses Retry-After with full jitter too', () => {
    expect(
      simulate(fixture({ retryAfterMs: 6000 }), 'jitter').attempts[1].startMs,
    ).toBe(6100);
  });
  it('measures each deadline and successful latency from its own launch', () => {
    const r = simulate(
      fixture({ clients: 3, launchGapMs: 1000, outageMs: 0, deadlineMs: 99 }),
      'backoff',
    );
    expect(r.clients.map((c) => c.finishedMs)).toEqual([99, 1099, 2099]);
    expect(r.clients.map((c) => c.elapsedMs)).toEqual([99, 99, 99]);
  });
  it('is deterministic without mutating inputs', () => {
    const input = Object.freeze(fixture());
    expect(compare(input)).toEqual(compare(input));
    expect(input).toEqual(fixture());
  });
  it('keeps client random streams stable when population grows', () => {
    const a = simulate(fixture({ clients: 2 }), 'jitter');
    const b = simulate(fixture({ clients: 20 }), 'jitter');
    expect(b.attempts.filter((v) => v.client <= 2)).toEqual(a.attempts);
  });
  it('changes the jitter timeline with the seed', () => {
    expect(simulate(fixture({ seed: 1 }), 'jitter').attempts).not.toEqual(
      simulate(fixture({ seed: 2 }), 'jitter').attempts,
    );
  });
  it('keeps no-jitter results independent of the seed', () => {
    expect(simulate(fixture({ seed: 1 }), 'backoff')).toEqual(
      simulate(fixture({ seed: 2 }), 'backoff'),
    );
  });
  it('reports fixed 250 ms retry peaks excluding initial attempts', () => {
    const r = simulate(fixture({ clients: 40 }), 'backoff');
    expect(r.peakRetries).toBe(40);
    expect(r.amplification).toBe(4);
  });
  it('keeps every retry in exactly one visual bucket', () => {
    const r = compare(sample);
    for (const p of ['backoff', 'jitter'] as const)
      expect(r.buckets.reduce((n, b) => n + b[p], 0)).toBe(
        r[p].attempts.length - sample.clients,
      );
    expect(r.buckets.length).toBeLessThanOrEqual(60);
  });
  it('supports maximum-sized scenarios within bounded work', () => {
    const r = compare({
      ...sample,
      clients: 200,
      launchGapMs: 1000,
      outageMs: 60000,
      latencyMs: 5000,
      maxAttempts: 12,
      deadlineMs: 120000,
      baseMs: 30000,
      capMs: 60000,
    });
    expect(r.buckets.length).toBeLessThanOrEqual(60);
    expect(r.backoff.attempts.length).toBeLessThanOrEqual(2400);
    expect(r.jitter.clients).toHaveLength(200);
  });
  it('matches an independent closed-form schedule across 100 no-jitter scenarios', () => {
    for (let i = 1; i <= 100; i++) {
      const s = fixture({
        clients: 3,
        launchGapMs: i,
        outageMs: i * 37,
        baseMs: i * 13,
        capMs: i * 29,
        maxAttempts: 12,
        deadlineMs: 120000,
        latencyMs: i + 1,
      });
      const r = simulate(s, 'backoff');
      for (let c = 1; c <= 3; c++) {
        const expected: number[] = [];
        for (let k = 0; k < s.maxAttempts; k++) {
          const start =
            (c - 1) * s.launchGapMs +
            k * s.latencyMs +
            Array.from({ length: k }, (_, j) =>
              Math.min(s.capMs, s.baseMs * 2 ** j),
            ).reduce((a, b) => a + b, 0);
          expected.push(start);
          if (start >= s.outageMs) break;
        }
        expect(
          r.attempts.filter((a) => a.client === c).map((a) => a.startMs),
        ).toEqual(expected);
      }
    }
  });
  it('satisfies jitter bounds, temporal ordering and conservation for 100 seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const s = fixture({ seed, clients: 10, retryAfterMs: 17 });
      const r = simulate(s, 'jitter');
      expect(r.successes + r.exhausted + r.deadlines).toBe(s.clients);
      for (const c of r.clients) {
        const events = r.attempts.filter((a) => a.client === c.client);
        expect(events.length).toBe(c.attempts);
        for (let i = 1; i < events.length; i++) {
          const a = events[i];
          expect(a.startMs).toBe(events[i - 1].endMs + a.waitMs);
          expect(a.waitMs).toBeGreaterThanOrEqual(17);
          expect(a.waitMs).toBeLessThanOrEqual(
            Math.max(17, Math.min(s.capMs, s.baseMs * 2 ** (i - 1))),
          );
          expect(a.startMs).toBeLessThan(s.deadlineMs);
        }
      }
    }
  });
});
describe('bounded scenario ingestion', () => {
  it('round trips the sample', () => {
    expect(parseScenario(JSON.stringify(sample))).toEqual(sample);
  });
  it.each([null, [], '', 3, true])('rejects non-object %j', (value) => {
    expect(() => validate(value)).toThrow();
  });
  it('rejects every missing field', () => {
    for (const key of Object.keys(sample)) {
      const input: Record<string, unknown> = { ...sample };
      delete input[key];
      expect(() => validate(input)).toThrow();
    }
  });
  it('rejects fractions, strings, nulls and non-finite numbers for every field', () => {
    for (const key of Object.keys(sample))
      for (const value of [1.5, '1', null, NaN, Infinity])
        expect(() => validate({ ...sample, [key]: value })).toThrow();
  });
  it('rejects both limits of every field', () => {
    for (const [key, [min, max]] of Object.entries(limits))
      for (const v of [min - 1, max + 1])
        expect(() => validate({ ...sample, [key]: v })).toThrow();
  });
  it('rejects unknown and prototype-named fields', () => {
    expect(() => validate({ ...sample, extra: 0 })).toThrow();
    expect(() =>
      parseScenario(JSON.stringify({ ...sample, constructor: 0 })),
    ).toThrow();
  });
  it('rejects a cap below the base', () => {
    expect(() => validate({ ...sample, capMs: sample.baseMs - 1 })).toThrow(
      /Maximum backoff/,
    );
  });
  it('rejects malformed or oversized JSON', () => {
    expect(() => parseScenario('{')).toThrow();
    expect(() => parseScenario(' '.repeat(10001))).toThrow(/10,000/);
  });
});
