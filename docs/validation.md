# Validation scope

Base: upstream v0.5.0 (`713377f366771e3e4730e6acd1bc290e0ebc6d6e`).

This publication contains source code only. No private course fixtures, account credentials, screenshots of learning history, or local provider routes are included.

## Reproducible checks

```sh
npm ci
npm run typecheck
NODE_ENV=test node --import tsx --test tests/render-cards.test.tsx tests/render-composer.test.tsx tests/render-graph-chrome.test.tsx tests/render-minimal-home.test.tsx tests/render-new-session.test.tsx tests/render-phase-divider.test.tsx tests/render-plan-block.test.tsx tests/render-sidebar.test.tsx tests/settings-pure.test.ts
npm ci --prefix acp
npm run --prefix acp build
npm test --prefix acp
```

The optional `scripts/personal-*-smoke.mjs` browser checks require a **disposable test backend**, Chrome (`CHROME_PATH` can override its location), `LH_PREVIEW_URL`, and `LH_PREVIEW_CHAT_ID` pointing to an appropriate synthetic course. These fixtures are not supplied by real user data. The layout check intercepts answer submission, but the UI check changes appearance settings: never point it at a production course directory. Mobile viewport checks are not a substitute for iPhone testing.

## Limits

The complete upstream suite, all three desktop platforms, fresh production packaging, and real iPhone end-to-end behavior have not been revalidated as part of this source publication. Earlier local use is not a guarantee for a clean installation. Per-check publication results are recorded below after execution.

## Publication checks — 2026-11-11

- Fresh dependency installation completed in the separate publication checkout.
- TypeScript `npm run typecheck`: passed after annotating the ACP answer-normalization callback.
- Nine targeted UI/settings test files: **163 passed**, 0 failed.
- Rebuilt ACP core and adapter tests: **12 passed**, 0 failed.
- `git diff --check`, syntax checks for the adapted smoke scripts, and targeted scans for private paths, course IDs, relay configuration and credential patterns: passed.
- The original source commit and AGPL license are retained. Generated app bundles, local settings, course data, and screenshots of learning history are not included.
- No fresh production app package or phone end-to-end test was performed for this publication. Remote CI is separate from these local results.
