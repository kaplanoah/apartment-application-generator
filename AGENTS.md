# AGENTS.md

Rules for anyone changing this repository, people and coding agents alike. The CI review
checks pull requests against them.

## Privacy and security (never break these)

- The app never uses the network. No `fetch`, XHR, WebSocket, beacons, remote fonts, images,
  scripts or analytics, and nothing that loosens the Content-Security-Policy written by
  `build/inlineSingleFile.ts`.
- Nothing is stored: no cookies, local or session storage, IndexedDB or caches. Contact details
  come from `contact-info.txt` in the person's own folder.
- Third-party code runs only inside the sealed PDF worker (`src/worker/`). Don't add runtime
  dependencies; if one is truly needed, it must run in that worker and be pinned exactly.
- Keep the worker seal (`src/worker/seal.ts`) and the page's check that the worker is sealed
  before every build (`src/browser/packetClient.ts`).
- Insert text with `h()` from `src/ui/dom.ts`. Never parse strings as HTML.
- No real personal data anywhere: code, samples, tests, docs or screenshots use the fake
  "Alex Sample" and "Jordan Sample" examples.

## Code

- Keep code clean, consistent, readable, secure and maintainable. Follow best practices; don't
  be clever.
- `src/core` holds pure logic with no browser APIs, so it's fast to test. Browser glue lives in
  `src/browser`, PDF assembly in `src/pdf`, the interface in `src/ui`.
- Name functions with a verb for what they do and variables with full words.
- Comment only a non-obvious why, and keep comments true as the code changes.
- Messages people see say what went wrong and how to fix it, in plain words. Never show a
  browser's raw error as the explanation (see `toNotice` in `src/ui/actions.ts`).

## Tests

- Every behavior change comes with tests that fail without it, in the same pull request.
- Test logic in Node with Vitest (`tests/unit/`); it takes milliseconds. Use a browser test
  (`tests/e2e/`, Playwright against the built file) only for what needs a browser: the real
  file picker, the worker, downloads, layout.
- In browser tests, wait for what the page shows with `expect(locator)`, never for a fixed time.
- Tests pass in any time zone; CI runs the unit tests in three.

## Shipping a change

1. Work on a branch and open a pull request; never push to `main` directly.
2. Before pushing, run `npm run check` (format, lint, types, dead code, unit and browser tests).
3. Merge only when the CI `check` job is green and review comments are resolved.
