# Security and privacy

Rental applications contain the most sensitive documents people have: Social Security
numbers, pay, bank balances, IDs. This tool is built so that **those documents never
leave your computer and are never stored by the app**, and so that this holds even if a
dependency were ever compromised.

## What the app guarantees

| Guarantee                           | How it's enforced                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No network access, ever             | A strict Content-Security-Policy in the HTML file (`default-src 'none'`, `connect-src 'none'`). The browser enforces it, not the app's code.                                                                                                                                                                                                                  |
| Only the app's own code runs        | The policy allows exactly the inlined script and stylesheet, pinned by SHA-256 hash. No external scripts, fonts, images or frames can load.                                                                                                                                                                                                                   |
| The PDF library is sealed off       | pdf-lib (the only third-party code) never runs on the page. It runs in a separate worker that has no access to the page, can't navigate or open windows, and has every network, storage and code-loading API deleted before pdf-lib loads (`src/worker/seal.ts`). The page asks the worker to prove this before every build and refuses to build if it can't. |
| Nothing is stored                   | No cookies, local storage, IndexedDB or caches. Contact details come from a text file in your own folder. Each build uses a fresh worker that is discarded afterwards.                                                                                                                                                                                        |
| No HTML injection                   | File names and contact details are only ever inserted as text (`src/ui/dom.ts`). `innerHTML` and similar APIs are banned by the lint rules.                                                                                                                                                                                                                   |
| Untrusted files handled defensively | PDFs are parsed in the sealed worker. The photo-metadata reader bounds-checks every byte and is fuzz-tested against corrupt input.                                                                                                                                                                                                                            |

These are checked automatically:

- **Lint rules** (`eslint.config.js`) reject `fetch`, `XMLHttpRequest`, `WebSocket`,
  `sendBeacon`, `localStorage`, cookies, `innerHTML`, `eval` and similar in the app code,
  and a test proves the rules catch them.
- **Unit tests** cover the worker seal, the message checks and the generated policy.
- **End-to-end tests** open the built file from disk in real browsers, build a packet, and
  assert that the page made **zero** network requests, that `fetch` is blocked, and that
  nothing was written to any browser storage.

## Check it yourself

1. Turn off Wi-Fi, open the HTML file and build a packet. It works the same.
2. In Safari, choose Develop → Show Web Inspector → Network (turn on the Develop menu in
   Safari Settings → Advanced). The list stays empty while you use the app.
3. Open the HTML file in a text editor: the first lines include the
   `Content-Security-Policy` with `connect-src 'none'`.
4. If you downloaded a release, compare its SHA-256 with the checksum published next to
   it: `shasum -a 256 apartment-packet-builder.html`.

## What it can't protect against

- **Your computer itself.** Malware, or a browser extension with access to all pages, can
  read anything you open. Use a browser profile without extensions if you're unsure.
- **The finished PDF.** Once you email or upload it, it's out of your hands. The footer
  names the apartment and month, which makes reuse obvious, but it can be edited out.
  Consider whether each document needs your full SSN: many landlords only need the last
  four digits. Use a real redaction tool. A black box drawn on top in Preview leaves the
  text underneath.
- **A compromised dependency changing the output.** The seal stops pdf-lib from sending
  anything anywhere, but code that builds the PDF can still decide what goes into it. The
  dependency is pinned to an exact version and checked against `package-lock.json`
  integrity hashes on install.
- **Your documents folder.** It's protected only as well as your Mac is. FileVault (disk
  encryption) and, for iCloud Drive, Advanced Data Protection are worth turning on.

## Dependency policy

- One runtime dependency: [pdf-lib](https://github.com/Hopding/pdf-lib), pinned exactly.
- Everything is bundled into the single HTML file at build time; nothing is fetched when
  it runs.
- New runtime dependencies need a strong reason and must run inside the sealed worker.

## Reporting a problem

Please report security issues privately through GitHub's **Report a vulnerability**
button on the repository's Security tab, not in a public issue.
