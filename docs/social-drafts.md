# Unpublished social drafts

## LinkedIn

I built Retry Studio to make retry-policy discussions more concrete.

It runs a synthetic outage locally in your browser and compares capped exponential backoff with seeded full jitter. You can change the attempt budget, deadline and Retry-After floor, inspect each client's timeline, and export the complete comparison.

The interesting tradeoff: spreading retry traffic and completing more requests are different objectives. A policy can consume its attempts before recovery. The interface shows completion counts alongside burst metrics so that distinction stays visible.

Built with TypeScript, Vite and semantic HTML, with unit and browser tests. This is an explorable model, not a load test: the endpoint has unlimited capacity and the outage does not react to traffic.

Try it: https://christiansada.github.io/retry-studio/

Code: https://github.com/Christiansada/retry-studio

Contributions welcome: independent timing fixtures, multi-seed summaries and clearly documented capacity models.

## X

Built Retry Studio: compare backoff and seeded jitter through a synthetic outage. Inspect retry bursts, deadlines and every attempt; export the evidence. Browser-local, MIT. A model, not a load test.

https://christiansada.github.io/retry-studio/

## Publication rule

Drafts only. Verify the links and live interactions before using this copy. No social content is posted by the automation.
