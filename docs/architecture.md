# Model and architecture

## Boundaries

`Scenario` is a flat object of ten required integers. `validate` checks types, bounds, unknown keys and cap >= base. It returns a new object. The renderer only interpolates validated numbers or internal enum values; imported strings never become HTML.

Each policy runs at most 200 × 12 attempts. Clients are independent because the endpoint has unlimited capacity. A client starts at `(clientId - 1) * launchGapMs`. Its deadline is that time plus `deadlineMs`. Recovery uses the shared absolute clock.

## One client

1. Start an attempt strictly before its deadline.
2. If response latency crosses the deadline, record a truncated attempt with response `deadline` and stop.
3. Otherwise record 503 if started before recovery or 200 if started at/after recovery.
4. Stop on success. For a failure, stop on deadline, then attempt exhaustion, in that priority order.
5. Compute capped exponential delay (or integer full jitter), apply the synthetic floor, and schedule from response completion.
6. If the next start is at/after the deadline, record a deadline client outcome without inventing an extra request.

`Attempt.waitMs` is the wait before that attempt, zero for the first. A client waiting for an impossible next attempt has `finishedMs` at its deadline; this is a deadline budget outcome, not another response event. Logs are sorted by absolute start, client, and attempt.

## Reproducibility

Full jitter uses a Mulberry32-style 32-bit integer generator, authored directly with JavaScript integer operations, initialized per client with `seed XOR imul(clientId, 0x9e3779b1)`. Each failed attempt eligible for retry consumes one draw. Delay is `floor(u * (bound + 1))` for `u` in [0,1). These are deterministic pseudorandom values for demonstration, not cryptography or a claim of independent experimental observations. Adding clients does not change earlier clients' streams.

## Aggregation

Metrics use full logs. Peak retries counts only attempts 2+, in 250 ms buckets aligned to zero. Chart bucket width is a multiple of 250 ms, chosen to keep at most 60 buckets on a common scale. Empty chart intervals remain present. A no-retry scenario has a zero-height chart, zero peak and no fabricated activity. P95 is nearest-rank over successful elapsed times.

## UI and files

- `src/model.ts`: validation, simulation, metrics, chart aggregation.
- `src/main.ts`: numeric controls, rendering, audit selection, bounded file input, JSON download.
- `src/style.css`: responsive layout and visible focus states.
- `public/sample.json`: synthetic input fixture.
- `tests/`: model checks plus production-browser interaction and accessibility checks.

Edits clear the comparison and export. Imports use a generation counter so a slow file read cannot replace a newer edit or reset. Output contains schemaVersion 1, the scenario, both results and buckets; there is no timestamp or private device information in the exported object.

No network calls occur in the model or UI logic. Page assets are loaded normally from the host. There is no database, worker service, telemetry, session storage or local storage.
