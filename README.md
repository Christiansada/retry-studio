# Retry Studio

A browser-local outage workbench for API, automation and AI-agent developers who need to reason about **what happens after a request fails**.

[Open the workbench](https://christiansada.github.io/retry-studio/) · [Method and architecture](docs/architecture.md) · [Demo walkthrough](docs/demo.md)

Retries can synchronize into bursts, consume attempt budgets before recovery, or miss a deadline. Retry Studio makes those tradeoffs visible using one explicit synthetic outage and two retry policies. It sends no real requests to a target endpoint.

## Capabilities

- Compare capped exponential backoff with seeded integer full jitter on a shared clock.
- Set 1–200 clients, launch spacing, recovery time, fixed response latency, total attempt limit, backoff base/cap, per-client deadline, and a synthetic Retry-After floor.
- Inspect completion counts, exhaustion/deadline stops, total attempts, amplification, fixed-bucket retry peaks, and P95 successful latency.
- Explore paired retry arrival bars with an exact accessible bucket table.
- Follow every attempt for any client under either policy.
- Import a bounded JSON scenario and export complete inputs, both event logs, client outcomes and chart buckets.
- Clear results and export immediately when inputs change. Reset to the labelled synthetic example at any time.

This is a policy discussion tool, not a load test or a prediction of service availability.

## Stack and data flow

TypeScript, Vite, semantic HTML, CSS. No runtime package dependencies, backend, analytics, account, persistence, external fonts, or model API. Development uses Vitest, Playwright, axe, ESLint and Prettier.

`form / local JSON → bounded validation → two pure simulations → shared buckets → UI / JSON export`

The pure engine is in `src/model.ts`. DOM rendering and import/export live in `src/main.ts`. See [architecture](docs/architecture.md) for boundary semantics and pseudorandom generation.

## Install and run

Use Node.js 22.12+ (CI uses Node 24) and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. No configuration is required. `.env.example` documents the absence of secrets or environment variables.

## Usage

1. Start with the synthetic sample or import `public/sample.json` through **Import scenario JSON**.
2. Change the outage or budget; press **Compare policies**.
3. Compare success counts as well as peak retries. A lower peak is not automatically a better outcome.
4. Inspect a client and the exact bucket counts to understand the mechanism.
5. Export evidence. The exported comparison contains the input under `scenario`; to reimport, save that object alone as JSON. The full comparison is an evidence file, not a scenario file.

All fields are required integers. Unknown fields are rejected. JSON uses the platform parser (duplicate keys use the last value); the input object then passes bounded validation. Imports are limited to 10,000 bytes in the UI and 10,000 characters in the pure parser. There are no arbitrary text or endpoint fields.

## Model and metrics

Each client sends one initial request, then retries sequentially. An attempt started before `outageMs` receives 503; one started at or after recovery receives 200. The response arrives after `latencyMs`, unless the per-client deadline cuts it short.

After failed attempt k, the backoff bound is `min(capMs, baseMs * 2^(k-1))`. Capped backoff waits that duration. Full jitter samples an integer from zero through the bound, inclusive. Both apply `max(policyDelay, retryAfterMs)` after receiving the response. This floor is a synthetic duration, not a Retry-After header parser. The maximum attempt count includes the initial attempt.

A new attempt cannot start at or after its deadline. Success arriving exactly at the deadline counts. A failed response exactly at it counts as a deadline stop. No completion beyond a deadline is silently counted as success.

Peak retries means the largest retry-start count in fixed **250 ms buckets aligned to t=0**, excluding all first attempts. The visual chart may merge these buckets to stay within 60 bars and labels its own bucket width. Amplification is attempts / clients. P95 uses nearest rank over successful client elapsed times only; it is null when none succeed. Compare success counts alongside P95 to avoid survivorship bias.

## Tests and validation

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
```

`check` runs formatting, lint, strict types, unit tests and a production build. Browser tests require a built `dist/`; they run against Vite preview. Windows uses installed Microsoft Edge; other platforms use Playwright Chromium. On Linux CI, use `npx playwright install --with-deps chromium`.

Unit checks include hand-calculated schedules, deadlines, cap/floor behavior, input bounds, 100 independently calculated no-jitter scenarios and conservation/timing invariants across 100 jitter seeds. Browser checks exercise real downloads, imports, invalidation, keyboard submission, audit controls, axe, responsive widths and doubled text. Tests describe checks they execute; passing them is not a guarantee of complete accessibility or real-world suitability.

## Build and deployment

```sh
npm run build
npm run preview
```

Upload `dist/` to a static host. Relative Vite asset paths support subdirectory hosting. The `Validate` GitHub Actions workflow runs on pushes and pull requests. To deploy this repository, select **GitHub Actions** under Settings → Pages, then dispatch **Deploy Pages** on `main`. It repeats validation before uploading the static build. No hosting credentials or application secrets are required.

## Limitations and sources

- One synthetic outage, fixed latency and an unlimited-capacity endpoint. Failure probability does not respond to traffic; fewer requests do not shorten the outage.
- No queueing, network variability, multiple retry layers, circuit breaker, cancellation propagation, adaptive throttling or SDK parity.
- All operations are assumed safe to repeat. The tool cannot establish idempotency or recommend retrying a real side effect.
- One seeded realization at a time, not confidence intervals or statistical evidence that one policy is best.
- Integer milliseconds, finite input bounds, relative deadlines; no HTTP-date parsing or real traces.
- No saved sessions. Download evidence before closing the tab. Hosting receives ordinary page requests; scenario data is processed locally by the application.

All bundled data was authored for this project and is synthetic, under MIT. No private datasets or model weights are used. Model background: [AWS exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) and [MDN Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After). Interaction research: [Carbon data-table guidance](https://carbondesignsystem.com/components/data-table/usage/) and [Observable Plot interactions](https://observablehq.github.io/plot/features/interactions). Code, visual composition and assets are original; no source or branding was copied from those references.

## Contributing and future work

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Useful contributions include independently verified timing fixtures, multi-seed summaries, explicit server-capacity models and additional retry policies with documented semantics. Any new model should clearly distinguish its assumptions from measured behavior. See [social drafts](docs/social-drafts.md) for unpublished demonstration copy.

MIT licensed; see [LICENSE](LICENSE).
