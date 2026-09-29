export interface Scenario {
  clients: number;
  launchGapMs: number;
  outageMs: number;
  latencyMs: number;
  maxAttempts: number;
  baseMs: number;
  capMs: number;
  deadlineMs: number;
  retryAfterMs: number;
  seed: number;
}
export type Policy = 'backoff' | 'jitter';
export type Outcome = 'success' | 'exhausted' | 'deadline';
export interface Attempt {
  client: number;
  attempt: number;
  startMs: number;
  endMs: number;
  waitMs: number;
  response: '200' | '503' | 'deadline';
}
export interface ClientResult {
  client: number;
  outcome: Outcome;
  finishedMs: number;
  elapsedMs: number;
  attempts: number;
}
export interface Result {
  policy: Policy;
  attempts: Attempt[];
  clients: ClientResult[];
  successes: number;
  exhausted: number;
  deadlines: number;
  amplification: number;
  p95SuccessMs: number | null;
  peakRetries: number;
}
export interface Bucket {
  startMs: number;
  endMs: number;
  backoff: number;
  jitter: number;
}
export const limits: Record<keyof Scenario, readonly [number, number]> = {
  clients: [1, 200],
  launchGapMs: [0, 1000],
  outageMs: [0, 60000],
  latencyMs: [1, 5000],
  maxAttempts: [1, 12],
  baseMs: [1, 30000],
  capMs: [1, 60000],
  deadlineMs: [1, 120000],
  retryAfterMs: [0, 60000],
  seed: [0, 4294967295],
};
export const sample: Scenario = {
  clients: 40,
  launchGapMs: 0,
  outageMs: 2000,
  latencyMs: 100,
  maxAttempts: 6,
  baseMs: 500,
  capMs: 4000,
  deadlineMs: 10000,
  retryAfterMs: 0,
  seed: 42,
};
export function validate(value: unknown): Scenario {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Scenario must be a JSON object.');
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some((key) => !Object.hasOwn(limits, key)))
    throw new Error('Scenario contains an unknown field.');
  const result = {} as Scenario;
  for (const key of Object.keys(limits) as (keyof Scenario)[]) {
    const v = obj[key];
    const [min, max] = limits[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
      throw new Error(`${key} must be an integer from ${min} to ${max}.`);
    result[key] = v;
  }
  if (result.capMs < result.baseMs)
    throw new Error('Maximum backoff must be at least the base backoff.');
  return result;
}
export function parseScenario(text: string): Scenario {
  if (text.length > 10000)
    throw new Error('Scenario exceeds 10,000 characters.');
  return validate(JSON.parse(text));
}
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function simulate(input: Scenario, policy: Policy): Result {
  const s = validate(input);
  if (policy !== 'backoff' && policy !== 'jitter')
    throw new Error('Unknown retry policy.');
  const attempts: Attempt[] = [];
  const clients: ClientResult[] = [];
  for (let client = 1; client <= s.clients; client++) {
    const rng = random(s.seed ^ Math.imul(client, 0x9e3779b1));
    const launch = (client - 1) * s.launchGapMs;
    const deadline = launch + s.deadlineMs;
    let start = launch;
    let wait = 0;
    for (let attempt = 1; attempt <= s.maxAttempts; attempt++) {
      const end = Math.min(start + s.latencyMs, deadline);
      const response =
        start + s.latencyMs > deadline
          ? 'deadline'
          : start >= s.outageMs
            ? '200'
            : '503';
      attempts.push({
        client,
        attempt,
        startMs: start,
        endMs: end,
        waitMs: wait,
        response,
      });
      let outcome: Outcome | undefined;
      let finished = end;
      if (response === '200') outcome = 'success';
      else if (response === 'deadline' || end >= deadline) outcome = 'deadline';
      else if (attempt === s.maxAttempts) outcome = 'exhausted';
      else {
        const bound = Math.min(s.capMs, s.baseMs * 2 ** (attempt - 1));
        wait = Math.max(
          s.retryAfterMs,
          policy === 'jitter' ? Math.floor(rng() * (bound + 1)) : bound,
        );
        start = end + wait;
        if (start >= deadline) {
          outcome = 'deadline';
          finished = deadline;
        }
      }
      if (outcome) {
        clients.push({
          client,
          outcome,
          finishedMs: finished,
          elapsedMs: finished - launch,
          attempts: attempt,
        });
        break;
      }
    }
  }
  attempts.sort(
    (a, b) =>
      a.startMs - b.startMs || a.client - b.client || a.attempt - b.attempt,
  );
  const successTimes = clients
    .filter((c) => c.outcome === 'success')
    .map((c) => c.elapsedMs)
    .sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const a of attempts)
    if (a.attempt > 1) {
      const bin = Math.floor(a.startMs / 250);
      counts.set(bin, (counts.get(bin) ?? 0) + 1);
    }
  return {
    policy,
    attempts,
    clients,
    successes: successTimes.length,
    exhausted: clients.filter((c) => c.outcome === 'exhausted').length,
    deadlines: clients.filter((c) => c.outcome === 'deadline').length,
    amplification: attempts.length / s.clients,
    p95SuccessMs: successTimes.length
      ? successTimes[Math.ceil(successTimes.length * 0.95) - 1]
      : null,
    peakRetries: Math.max(0, ...counts.values()),
  };
}
export function compare(input: Scenario) {
  const scenario = validate(input);
  const backoff = simulate(scenario, 'backoff');
  const jitter = simulate(scenario, 'jitter');
  const last = Math.max(
    ...backoff.attempts.map((a) => a.startMs),
    ...jitter.attempts.map((a) => a.startMs),
  );
  // A shared scale; align every visual bucket to the fixed 250 ms metric buckets.
  const width = Math.max(250, Math.ceil((last + 1) / 60 / 250) * 250);
  const buckets: Bucket[] = Array.from(
    { length: Math.floor(last / width) + 1 },
    (_, i) => ({
      startMs: i * width,
      endMs: (i + 1) * width,
      backoff: 0,
      jitter: 0,
    }),
  );
  for (const result of [backoff, jitter])
    for (const a of result.attempts)
      if (a.attempt > 1)
        buckets[Math.floor(a.startMs / width)][result.policy]++;
  return {
    schemaVersion: 1,
    scenario,
    backoff,
    jitter,
    bucketWidthMs: width,
    buckets,
  };
}
export type Comparison = ReturnType<typeof compare>;
