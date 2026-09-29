# Contributing

Open an issue explaining the user problem and model assumptions before a substantial feature. Keep changes focused. Do not include private traces, credentials, confidential code or identifying user data; use minimal synthetic examples.

Use Node 22.12+ and `npm ci`. Run `npm run check`, install Playwright Chromium (Windows uses Edge), then `npm run test:e2e`. Run `npm audit --audit-level=high`. Format with `npm run format`.

For simulation changes, add hand-worked or independent oracle cases, particularly at timing boundaries. Explain any metric changes. For UI changes, check keyboard operation, text enlargement, narrow screens and axe. Do not claim that simulated outcomes predict real service performance.

Submit a pull request with the problem, behavior, assumptions and checks actually executed. Contributions are provided under the MIT license. Good starting points: another independently verified timing fixture, clearer accessible chart exploration, or a documented multi-seed comparison.
