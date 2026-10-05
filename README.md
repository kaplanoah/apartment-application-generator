# Apartment Packet Builder

Turn one folder of rental-application documents into a single, tidy PDF for each
apartment: pick what that landlord asks for, put it in order, and get a packet with a
cover page, a linked table of contents and a footer on every page.

**Local only.** It's one HTML file you open in Safari or Chrome on your Mac. It never
connects to the internet, and your documents are never transferred or stored. See
[SECURITY.md](SECURITY.md) for how that's enforced and how to check it yourself.

## How it works

1. **Address.** Type the apartment's address. The footer on every page is made from
   your names and the address, like
   `Alex Sample & Jordan Sample · Application for 123 Main St, Apt 4B · Oct 2026`.
2. **Documents folder.** Click **Choose folder…** and pick the folder that holds all your
   documents. (Drag and drop isn't supported: browsers don't read large, nested folders
   reliably that way.)
3. **Order.** Every top-level folder and file in it appears as a tile. Drag the ones this
   apartment wants into the list, in order, and drag a card back up to remove it. For
   folders with dated files, choose **Last 2 months** or **Last 2 documents**, for example.
4. **Generate.** Choose a file size and click **Generate PDF**. It's saved to your
   Downloads folder.

## Setup (no coding needed)

### 1. Get the app

Download `apartment-packet-builder.html` from the
[Releases page](../../releases) and keep it anywhere, such as your Documents folder.

> No release yet? Ask someone who uses Node.js to run `npm ci && npm run build` and send
> you `dist/index.html`, or follow [For developers](#for-developers).

### 2. Set up your documents folder

Keep it **outside** this project, for example `Documents/Apartment Docs`. Arrange it
however makes sense to you. Here's one way:

```
Apartment Docs/
├── contact-info.txt          ← names and contact details for the cover
├── Cover Letter.pdf          ← a top-level file is its own option
├── ID/
│   ├── alex-license.jpg
│   └── jordan-passport.pdf
├── Pay Stubs/
│   ├── Alex/
│   │   ├── 2026-09-18.pdf
│   │   └── 2026-09-04.pdf
│   └── Jordan/
│       └── jordan_2026-09-30.pdf
├── W-2s/
│   ├── Alex/w2_2025.pdf
│   └── Jordan/w2_2025.pdf
└── Bank Statements/
    ├── Chase/2026-09.pdf
    └── Ally/2026-09.pdf
```

The rules:

- **Each top-level folder and top-level file is one option** you can drag into the packet.
  Folder names are used as section titles, so name them the way you want them to read.
- **Files associated with years or months must end with the format YYYY-MM-DD, YYYY-MM,
  or YYYY**, so date ranges work: `w2_2025.pdf`, `2026-09.pdf`, `jordan_2026-09-30.pdf`.
  US-style dates like `09-10-2026` are ignored because they're ambiguous.
- **Subfolders are fine** (for example one per person). Their names don't matter. They're
  only shown as faint labels.
- **One nesting level per folder.** A folder uses only the files at its deepest level. If
  `Bank Statements/` has `Chase/2026-09.pdf` and also a loose `summary.pdf`, the loose
  one is left out, and the app tells you so.
- **Supported files:** PDF, JPG, PNG, HEIC (iPhone photos; HEIC needs Safari) and plain
  text (`.txt`, laid out on letter pages). Hidden files like `.DS_Store` are ignored.
- **Word, Pages and similar files** can't be reproduced faithfully outside their own apps,
  so save them as PDF (Pages: File → Export To → PDF; Word: File → Save As → PDF). Keep
  the PDF next to the original with the same name, and the original is skipped quietly.
  The app tells you about any that still need a PDF.

### 3. Add your contact info

Create a plain-text file named `contact-info.txt` at the top of the folder. In TextEdit,
choose Format → Make Plain Text before saving.

```
Name: Alex Sample
Email: alex@example.com
Phone: (555) 010-2481

Name: Jordan Sample
Email: jordan@example.com
Phone: (555) 010-7730
```

One `Label: value` per line, a blank line between people, and each person starts with
`Name`. Other labels (like `Current address: 88 Elm St`) are printed too. Lines starting
with `#` are ignored. If something's off, the app points to the exact line.

### 4. Open the app

Double-click `apartment-packet-builder.html`. If it opens in something other than a
browser, right-click it and choose Open With → Safari (or Chrome).

Want to try it first? Use the fake sample folder in [`example/Apartment Docs`](example).

## Date ranges

| Choice               | What's included                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Last 2 months**    | Files dated within the last two _full_ months. On Oct 4 that's Aug 1 – Sep 30. Switch to "through today" for Aug 4 – Oct 4.   |
| **Last 2 documents** | The newest two files **in each subfolder**, so "last 2 W-2s" gives two for each person when they're in `Alex/` and `Jordan/`. |
| **All files**        | Everything in the folder. Folders without dates always use this.                                                              |

Folders start on a sensible choice: months for pay stubs and statements, documents for
files dated only by year (W-2s, tax returns).

## File size

Text is never changed, so it stays sharp. Only photos and scanned images are resized,
including the ones inside PDFs (a scanned ID saved as a PDF is usually one big photo).
Sizes are based on how large an image prints on a letter page:

| Choice                 | Photos and scans | Good for                               |
| ---------------------- | ---------------- | -------------------------------------- |
| Smaller                | about 110 dpi    | email and upload limits                |
| **Balanced** (default) | about 150 dpi    | almost everything. IDs stay crisp.     |
| High                   | about 300 dpi    | printing. Looks the same as originals. |

An image is re-encoded when it's bigger than the limit, or when it's stored losslessly
(as Pages, Word and "Save as PDF" do with pictures, and in PNG files) and a JPEG would be
less than half the size. The result is used only if it's actually smaller. Small lossless
images like logos are left alone, and images the app can't safely change (CMYK, JPEG 2000,
color-key masks) are kept exactly as they are.

Every packet is also cleaned up losslessly, whichever size you pick: logos, fonts and
images repeated across documents (a year of bank statements, say) are stored once,
uncompressed data is compressed, and leftovers like page thumbnails are dropped. Nothing
you can see changes.

For packets over 5 MB, the app shows which sections take up the most space afterwards.

## Troubleshooting

- **"Password-protected"**: open the PDF in Preview, choose File → Export as PDF, and use
  the exported copy.
- **"This browser can't open HEIC photos"**: use Safari, or open the photo in Preview and
  export it as JPEG.
- **"Some files couldn't be read"**: they may still be in iCloud. In Finder, click the
  cloud icon to download them.
- **A file isn't showing up**: check it's at the same depth as the other files in its
  folder. The faint "Not included" line under each card says why.
- **"Save this as a PDF to use it"**: it's a Word, Pages or similar file. Export it as PDF
  next to the original, then add the folder again.

## For developers

Requires Node.js 22 or newer.

```sh
npm ci                # install exact, integrity-checked dependencies
npm run dev           # live-reloading dev server
npm run build         # → dist/index.html, the single self-contained file
npm test              # unit tests (Vitest)
npm run test:e2e      # build, then end-to-end tests in a real browser (Playwright)
npm run deadcode      # unused files, exports and dependencies (knip)
npm run check         # everything CI runs: format, lint, types, dead code, unit and e2e tests
npm run example       # regenerate the fake example folder
```

The first time you run end-to-end tests locally, install the browser:
`npx playwright install chromium` (add `webkit` and set `E2E_WEBKIT=1` to test Safari's engine).

### Project layout

```
src/
  core/      Pure logic, no browser APIs: dates, folder rules, ranges, contact file, naming
  pdf/       Packet assembly with pdf-lib: cover, contents, links, bookmarks, footers, photos
  worker/    The sealed worker that runs pdf-lib, its seal, and the message protocol
  browser/   Browser glue: reading folders, preparing photos, saving the file
  ui/        The interface: four steps, a tiny element builder and a state store
build/       Vite plugin that inlines everything into one HTML file with a hashed CSP
tests/       Unit tests, end-to-end tests and shared helpers
scripts/     Sample-document generator (used by tests and the example folder)
```

How a packet is built: the folder becomes a `Library` of options (`core/library.ts`). The
arranged `PacketItem`s are resolved into sections (`core/packet.ts`). The page reads the
chosen files and prepares photos, then hands the bytes to a fresh sealed worker
(`browser/packetClient.ts`), which assembles the PDF (`pdf/buildPacket.ts`) and returns it.

The "Details" link next to the local-only notice points to the security page of the
repository named in `package.json` (`repository.url`). Update it if you fork the project.

### Contributing

The rules for changes, including the privacy guarantees, are in [AGENTS.md](AGENTS.md).
Every change goes through a pull request. CI runs lint, formatting, types, dead-code
detection, unit tests in three time zones, and browser tests in Chromium and WebKit side by
side; the single `check` job passes only when all of them do, so require it before merging.

Pull requests are also reviewed by Claude for bugs, privacy and security issues, and rule
violations. To turn that on in your copy, add a `CLAUDE_CODE_OAUTH_TOKEN` (or
`ANTHROPIC_API_KEY`) repository secret; without one, the review step is skipped.

## License

[MIT](LICENSE)
