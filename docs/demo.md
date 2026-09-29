# 90-second demonstration

This is a plan for demonstrating the working application, not a recorded video or a static mockup.

Repository: https://github.com/Christiansada/retry-studio

Workbench: https://christiansada.github.io/retry-studio/

1. **0–15 seconds — Problem.** Open the workbench and point to the 40 synthetic clients and two-second outage. Explain why synchronized retries deserve inspection.
2. **15–35 seconds — Compare.** Show successes, exhausted budgets, total attempts and the retry chart. Explain that full jitter can spread starts while also consuming attempts sooner. Do not claim a universal improvement.
3. **35–50 seconds — Audit.** Choose Full jitter and Client 2. Read actual start, end, wait and response values from the table. Expand exact bucket counts.
4. **50–65 seconds — Constraint.** Change the client deadline to 1 ms. Note that old results disappear. Compare again and show deadline stops. Reset the sample.
5. **65–80 seconds — Evidence.** Export JSON and inspect the scenario, event logs and client outcomes. Demonstrate importing the downloadable sample scenario.
6. **80–90 seconds — Technical value and limits.** Mention bounded pure simulation, seeded per-client streams, tests and local computation. State that this model has no server-capacity feedback or real network. Show the repository link and invite independently verified model extensions.

Use actual results from the current build. No fabricated production statistics or recordings of unimplemented features. Release verification and screenshots are recorded separately in the daily run report.
