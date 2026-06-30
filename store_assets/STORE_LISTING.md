# Chrome Web Store Listing

Copy-paste-ready metadata for publishing TabBatch PDF.

---

## Name (≤ 45 chars)
```
TabBatch PDF — Save & Merge Tabs to PDF
```

## Short summary / "Short description" (≤ 132 chars)
```
Save any number of open tabs as crisp vector PDFs, then reorder and merge them into one polished document. Fast, private, offline.
```

## Category
Productivity

## Language
English

---

## Detailed description

```
TabBatch PDF turns a window full of tabs into one clean, professional PDF — in just a couple of clicks.

Every page is captured as a TRUE VECTOR PDF using Chrome's own printing engine, so your text stays selectable, links stay clickable, and the file stays sharp at any zoom. Then you review, reorder, rename, and merge everything — entirely on your own computer.

★ NOTHING LEAVES YOUR DEVICE
No servers. No accounts. No uploads. No tracking. Your pages are captured and stored locally, and the bundled PDF engine makes zero network requests.

━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU CAN DO
━━━━━━━━━━━━━━━━━━━━━━

• Pick exactly what to capture — a live tab list with favicons and select-all/none
• Capture the current window or every window at once
• Two modes: Continuous (one tall page per tab, no ugly breaks) or Paged (A4, Letter, Legal, A3, A5, Tabloid; portrait or landscape)
• Reorder pages by drag-and-drop, or sort by title, date, or size
• Rename pages inline — names become bookmarks and contents entries
• Merge with optional PDF bookmarks, page numbers, and a clickable table of contents
• Set the merged document's title and author
• Preview any page, download individually, or recapture in place
• Light, dark, and system themes
• Keyboard shortcut (Ctrl/Cmd + Shift + Y) and right-click menus

━━━━━━━━━━━━━━━━━━━━━━
GREAT FOR
━━━━━━━━━━━━━━━━━━━━━━

• Saving research, articles, and documentation for offline reading
• Archiving receipts, invoices, and confirmations
• Bundling a chapter list or course material into one file
• Turning a reading session into a single, bookmarked PDF

━━━━━━━━━━━━━━━━━━━━━━
SMART & RELIABLE
━━━━━━━━━━━━━━━━━━━━━━

• Auto-scrolls pages so lazy-loaded images and sections render before capture
• Removes sticky headers/footers that cause gaps in continuous mode
• Oversized pages fall back to paged output so the renderer never crashes
• One problem tab never ruins the whole batch

Open some tabs, click the icon, choose what to keep, and download one tidy PDF. That's it.

TabBatch PDF is free and open source (MIT).
```

---

## Tags / search keywords
```
pdf, save as pdf, merge pdf, tabs to pdf, combine pdf, vector pdf, web to pdf,
print to pdf, save tabs, pdf merger, batch pdf, page to pdf, pdf converter
```

## Single purpose (for CWS review)
```
Capture the web pages of user-selected browser tabs as PDF files and merge them
into a single downloadable PDF document. All processing happens locally.
```

## Permission justifications (for CWS review)

- **debugger** — Required to call `Page.printToPDF`, the only API that generates true vector PDFs of a web page.
- **tabs** — To list the user's tabs and read their title/URL so the user can choose which to capture.
- **scripting / activeTab** — To measure full page dimensions and prepare lazy-loaded content before printing.
- **downloads** — To save the generated PDF file to the user's computer.
- **storage / unlimitedStorage** — To store captured PDFs locally (IndexedDB) between sessions.
- **notifications** — To notify the user when a capture batch finishes.
- **contextMenus** — To provide right-click "Capture this page" options.
- **host_permissions `<all_urls>`** — The user may capture any website they choose; the extension only acts on tabs the user explicitly selects.

## Data usage disclosures (CWS form)
- Does the item collect user data? **No data is collected or transmitted.**
- All functionality runs locally on the user's device.

## Assets checklist
- [x] Store icon 128×128 (`icons/icon128.png`)
- [x] High-res icon 512×512 (`store_assets/icon512.png`)
- [ ] At least one 1280×800 (or 640×400) screenshot of the popup and manager
- [ ] Optional 440×280 small promo tile
