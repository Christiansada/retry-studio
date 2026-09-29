import './style.css';
import {
  compare,
  limits,
  parseScenario,
  sample,
  type Comparison,
  type Policy,
  type Scenario,
} from './model';
const $ = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const labels: Record<keyof Scenario, string> = {
  clients: 'Clients',
  launchGapMs: 'Launch spacing (ms)',
  outageMs: 'Recovery time (ms)',
  latencyMs: 'Response latency (ms)',
  maxAttempts: 'Maximum attempts',
  baseMs: 'Base backoff (ms)',
  capMs: 'Maximum backoff (ms)',
  deadlineMs: 'Client deadline (ms)',
  retryAfterMs: 'Retry-After floor (ms)',
  seed: 'Random seed',
};
const keys = Object.keys(labels) as (keyof Scenario)[];
const traffic = new Set(['clients', 'launchGapMs', 'outageMs', 'latencyMs']);
for (const key of keys) {
  const [min, max] = limits[key];
  $(traffic.has(key) ? '#traffic-fields' : '#policy-fields').insertAdjacentHTML(
    'beforeend',
    `<label for="${key}">${labels[key]}<input id="${key}" name="${key}" type="number" min="${min}" max="${max}" step="1" required value="${sample[key]}" /></label>`,
  );
}
let current: Comparison | null = null;
let generation = 0;
const fmt = (n: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(n);
const name = (p: Policy) =>
  p === 'backoff' ? 'Capped backoff' : 'Full jitter';
function message(text: string) {
  $('#status').textContent = text;
}
function error(text: string) {
  $('#error').hidden = false;
  $('#error').textContent = text;
}
function invalidate() {
  generation++;
  current = null;
  $('#results').replaceChildren();
  $('#error').hidden = true;
  message(
    'Inputs changed. Compare policies to refresh the results and export.',
  );
}
function setScenario(s: Scenario) {
  for (const key of keys) $<HTMLInputElement>(`#${key}`).value = String(s[key]);
}
function readScenario(): Scenario {
  const obj = {} as Scenario;
  for (const key of keys) {
    const v = $<HTMLInputElement>(`#${key}`).value;
    obj[key] = v.trim() === '' ? NaN : Number(v);
  }
  return obj;
}
function exportResult() {
  if (!current) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'retry-studio-comparison.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderAudit() {
  if (!current) return;
  const p = $<HTMLSelectElement>('#audit-policy').value as Policy;
  const id = Number($<HTMLSelectElement>('#audit-client').value);
  const r = current[p];
  const c = r.clients.find((v) => v.client === id)!;
  $('#audit-summary').textContent =
    `${name(p)} · Client ${id} · ${c.outcome} · ${fmt(c.elapsedMs)} ms elapsed · ${c.attempts} attempts`;
  $('#audit-body').innerHTML = r.attempts
    .filter((a) => a.client === id)
    .map(
      (a) =>
        `<tr><th scope="row">${a.attempt}</th><td>${fmt(a.startMs)}</td><td>${fmt(a.endMs)}</td><td>${fmt(a.waitMs)}</td><td><span class="response ${a.response === '200' ? 'ok' : ''}">${a.response}</span></td></tr>`,
    )
    .join('');
}
function render(r: Comparison) {
  const max = Math.max(1, ...r.buckets.flatMap((b) => [b.backoff, b.jitter]));
  $('#results').innerHTML =
    `<section class="panel comparison"><div class="section-top"><p class="eyebrow">02 / COMPARE</p><button id="export" type="button" class="secondary">Export evidence ↓</button></div><h2>Two paths through failure</h2><p class="muted">${r.scenario.clients} clients · recovery at ${fmt(r.scenario.outageMs)} ms · seed ${r.scenario.seed}</p><div class="cards">${[r.backoff, r.jitter].map((v) => `<article class="policy ${v.policy}"><p class="policy-name"><span aria-hidden="true">${v.policy === 'backoff' ? '━' : '┄'}</span> ${name(v.policy)}</p><div class="score">${v.successes}<span> / ${r.scenario.clients} succeeded</span></div><p>${v.exhausted} exhausted · ${v.deadlines} deadline stops</p><dl><div><dt>Total attempts</dt><dd>${v.attempts.length} <span>(${fmt(v.amplification)}×)</span></dd></div><div><dt>Peak retries / 250 ms</dt><dd>${v.peakRetries}</dd></div><div><dt>P95 successful latency</dt><dd>${v.p95SuccessMs === null ? 'No successes' : `${fmt(v.p95SuccessMs)} ms`}</dd></div></dl></article>`).join('')}</div><p class="callout">Lower peaks do not guarantee more successes. Compare completion counts and the attempt budget together.</p></section>
  <section class="panel chart-panel"><p class="eyebrow">03 / SEE THE BURST</p><h2>When retries arrive</h2><p class="muted">Retry starts per ${fmt(r.bucketWidthMs)} ms · first attempts excluded · shared scale</p><div class="legend"><span><i class="solid"></i>Capped backoff</span><span><i class="striped"></i>Full jitter</span></div><div class="chart" role="img" aria-label="Retry arrival comparison. Exact values are available in the bucket table below."><span class="y-label">${max} starts</span><div class="bars">${r.buckets.map((b) => `<div class="bucket"><div class="bar backoff-bar" style="height:${(b.backoff / max) * 100}%"></div><div class="bar jitter-bar" style="height:${(b.jitter / max) * 100}%"></div></div>`).join('')}</div><div class="axis"><span>0 ms</span><span>${fmt(r.buckets[r.buckets.length - 1].endMs)} ms</span></div></div><details><summary>Inspect exact bucket counts</summary><div class="table-wrap" tabindex="0" role="region" aria-label="Retry buckets"><table><caption>Intervals include their start and exclude their end.</caption><thead><tr><th scope="col">Time (ms)</th><th scope="col">Backoff</th><th scope="col">Jitter</th></tr></thead><tbody>${r.buckets.map((b) => `<tr><th scope="row">${fmt(b.startMs)}–${fmt(b.endMs)}</th><td>${b.backoff}</td><td>${b.jitter}</td></tr>`).join('')}</tbody></table></div></details></section>
  <section class="panel audit"><p class="eyebrow">04 / FOLLOW A CLIENT</p><h2>Every attempt, accounted for</h2><div class="audit-filters"><div><label for="audit-policy">Policy</label><select id="audit-policy"><option value="backoff">Capped backoff</option><option value="jitter">Full jitter</option></select></div><div><label for="audit-client">Client</label><select id="audit-client">${r.backoff.clients.map((c) => `<option value="${c.client}">Client ${c.client}</option>`).join('')}</select></div></div><p id="audit-summary" aria-live="polite"></p><div class="table-wrap" tabindex="0" role="region" aria-label="Client attempt audit"><table><caption>Absolute start/end times; wait is before this attempt.</caption><thead><tr><th scope="col">Attempt</th><th scope="col">Start (ms)</th><th scope="col">End (ms)</th><th scope="col">Wait (ms)</th><th scope="col">Response</th></tr></thead><tbody id="audit-body"></tbody></table></div></section>`;
  $('#export').addEventListener('click', exportResult);
  $('#audit-policy').addEventListener('change', renderAudit);
  $('#audit-client').addEventListener('change', renderAudit);
  renderAudit();
}
function run() {
  current = null;
  $('#results').replaceChildren();
  $('#error').hidden = true;
  try {
    current = compare(readScenario());
    render(current);
    message('Comparison ready. Synthetic scenario; no requests were sent.');
  } catch (e) {
    error(e instanceof Error ? e.message : 'Unable to compare this scenario.');
    message('No results. Correct the scenario and compare again.');
  }
}
$('#scenario-form').addEventListener('input', invalidate);
$('#scenario-form').addEventListener('submit', (e) => {
  e.preventDefault();
  generation++;
  run();
});
$('#reset').addEventListener('click', () => {
  generation++;
  setScenario(sample);
  $<HTMLInputElement>('#import').value = '';
  run();
});
$('#import').addEventListener('change', async () => {
  invalidate();
  const version = generation;
  const input = $<HTMLInputElement>('#import');
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 10000) throw new Error('Scenario exceeds 10,000 bytes.');
    const text = await file.text();
    if (version !== generation) return;
    setScenario(parseScenario(text));
    run();
  } catch (e) {
    if (version === generation)
      error(e instanceof Error ? e.message : 'Unable to import scenario.');
  } finally {
    if (version === generation) input.value = '';
  }
});
run();
