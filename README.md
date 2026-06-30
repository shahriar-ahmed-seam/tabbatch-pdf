<div align="center">

<img src="icons/icon128.png" width="96" height="96" alt="TabBatch PDF logo" />

# TabBatch PDF

### Save & merge any number of open tabs into one polished PDF — fast, private, offline.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4f46e5)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tests](https://img.shields.io/badge/tests-53%20passing-2e9e5b)](tests/)
[![License: MIT](https://img.shields.io/badge/license-MIT-8b5cf6)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-109%2B-orange)](manifest.json)
![No tracking](https://img.shields.io/badge/tracking-none-2e9e5b)

</div>

---

## ✨ What it does

TabBatch PDF turns a window full of tabs into a single, professional PDF in a couple of clicks. Each page is captured as a **true vector PDF** using Chrome's printing engine, so text stays selectable, links stay clickable, and everything stays crisp at any zoom level. Then you review, reorder, rename, and merge — all on your machine.

> No servers. No accounts. No uploads. Your pages never leave your computer.

## 🚀 Features

| | |
|---|---|
| 🗂 **Pick exactly what to capture** | A live tab picker with favicons, select-all/none, and clear reasons for tabs that can't be captured. |
| 📄 **Vector capture** | `Page.printToPDF` via the DevTools Protocol — selectable text, real links, tiny files. |
| 📐 **Two capture modes** | *Continuous* (one tall page per tab, no awkward breaks) or *Paged* (A4 / Letter / Legal / A3 / A5 / Tabloid, portrait or landscape). |
| 🧩 **Smart oversize handling** | Pages taller than a safe limit automatically fall back to paged output so the renderer never chokes. |
| 🖼 **Visual manager** | Thumbnail grid to review everything before exporting. |
| ↕️ **Drag-to-reorder** | Rearrange pages by dragging, or sort by title / date / size. |
| ✏️ **Rename inline** | Click a title to rename it — used for bookmarks and the table of contents. |
| 🔖 **Bookmarks, page numbers & TOC** | Optional PDF outline (one bookmark per tab), stamped page numbers, and a clickable contents page. |
| 🏷 **Document metadata** | Set the merged PDF's title and author. |
| 🔄 **Recapture** | Re-grab any page in place if the site changed. |
| 🌓 **Light / dark / system theme** | Across the popup, manager, and settings. |
| ⌨️ **Keyboard shortcut** | `Ctrl/⌘ + Shift + Y` captures the whole window. |
| 🖱 **Right-click menu** | Capture the current page or the whole window from the context menu. |
| 🔒 **100% local & private** | Stored in IndexedDB on your device; nothing is transmitted anywhere. |

## 📥 Installation

### From source (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the project folder (the one with `manifest.json`).
5. Pin **TabBatch PDF** from the puzzle-piece menu.

Works in Chrome, Edge, Brave, Opera, and other Chromium browsers (v109+).

## 🧭 How to use

1. Open the tabs you want to save.
2. Click the **TabBatch PDF** toolbar icon.
3. Choose your scope (this window / all windows) and mode (continuous / paged).
4. Tick the tabs to include, then hit **Capture**.
5. The **Manager** opens automatically — reorder, rename, preview, or drop pages.
6. Pick your merge options (bookmarks, page numbers, contents) and click **Merge & Download**.

That's it. One PDF, exactly how you arranged it.

## ⚙️ Settings

Open the gear icon (or `chrome://extensions` → Details → Extension options) to set defaults for capture mode, paper size, margins, render scale, lazy-load scrolling, sticky-header removal, thumbnail quality, filename template, notifications, theme, and merge output. Settings sync across your Chrome profile.

**Filename tokens:** `{title}`, `{date}`, `{time}`, `{datetime}`, `{count}`.

## 🏗 Architecture

```
PDDFF/
├── manifest.json                 # MV3 configuration
├── icons/                        # 16 / 32 / 48 / 128 px app icons
├── lib/
│   └── pdf-lib.min.js            # bundled PDF engine (no CDN, fully offline)
├── src/
│   ├── background/
│   │   └── service-worker.js     # capture orchestration, CDP, keep-alive
│   ├── popup/                    # tab picker + live progress UI
│   ├── manager/                  # review, reorder, merge, export
│   ├── options/                  # settings page
│   └── shared/                   # utils, settings model, IndexedDB, theme
├── tests/                        # vitest unit + IndexedDB integration tests
└── store_assets/                 # icon generator + store imagery
```

**How capture works**

1. The service worker resolves the selected tabs and filters out pages Chromium forbids scripting (`chrome://`, the Web Store, etc.).
2. For each tab it attaches the debugger, optionally scrolls to trigger lazy content, hides sticky chrome, and measures the full document size.
3. `Page.printToPDF` renders a vector PDF (continuous or paged), which is stored as base64 in IndexedDB with a thumbnail.
4. The manager loads everything with **pdf-lib**, copies pages into one document, and applies your chosen bookmarks / page numbers / TOC / metadata before download.

A keep-alive ping prevents the MV3 service worker from sleeping mid-batch, and every per-tab capture is wrapped in timeouts and try/catch so one bad tab never sinks the run.

## 🔐 Permissions — and why

| Permission | Why it's needed |
|---|---|
| `debugger` | The only API that produces real vector PDFs (`Page.printToPDF`). |
| `tabs` | List and read the tabs you choose to capture. |
| `activeTab` / `scripting` | Measure page size and prepare lazy content for capture. |
| `downloads` | Save the finished PDF to your computer. |
| `storage` / `unlimitedStorage` | Keep captured PDFs locally between sessions. |
| `notifications` | Tell you when a capture finishes. |
| `contextMenus` | Right-click "Capture this page" entries. |
| `<all_urls>` | Capture whatever pages you point it at. |

See [PRIVACY.md](PRIVACY.md) for the full data story (spoiler: nothing leaves your device).

## 🧪 Development

```bash
npm install      # install dev dependencies (vitest, fake-indexeddb)
npm test         # run the unit + integration suite
npm run test:watch
```

Regenerate icons after editing the design:

```bash
python store_assets/make_icons.py
```

## 📦 Publishing

The extension is free to publish to the **Microsoft Edge Add-ons** store (no fee)
and costs a one-time **$5** for the **Chrome Web Store** — both accept the same
package and can be submitted from any browser.

```powershell
powershell -ExecutionPolicy Bypass -File store_assets/package.ps1   # builds tabbatch-pdf.zip
```

- Step-by-step instructions: [`store_assets/SUBMISSION.md`](store_assets/SUBMISSION.md)
- Ready-to-paste listing copy, tags & permission justifications: [`store_assets/STORE_LISTING.md`](store_assets/STORE_LISTING.md)
- Make correctly-sized store images (offline): open `store_assets/screenshot-framer.html`

## ❓ Troubleshooting

- **A tab was skipped.** Browser pages (`chrome://`, `edge://`), the Web Store, and the new-tab page can't be captured — that's a Chromium security rule, not a bug.
- **"Cannot attach debugger."** Close DevTools on that tab (a tab can only have one debugger client) and try again.
- **A long page split into multiple pages.** It exceeded the safe single-page height; raise *Max single-page height* in settings or use paged mode.
- **Lazy images missing.** Increase *Content settle delay* and keep *Auto-scroll* enabled.

## 🗺 Roadmap

- Per-tab page-range selection
- Drag-and-drop import of external PDFs into the merge
- Saved capture presets
- Optional password protection on export

## 🤝 Contributing

Issues and pull requests are welcome. Please run `npm test` before submitting.

## 📄 License

[MIT](LICENSE) © Shahriar Ahmed Seam. Built with [pdf-lib](https://pdf-lib.js.org/).
