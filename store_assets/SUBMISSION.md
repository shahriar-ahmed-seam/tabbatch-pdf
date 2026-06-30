# Publishing TabBatch PDF

This guide covers submitting to the **Microsoft Edge Add-ons** store (free) and the
**Chrome Web Store** ($5 one-time). You do **not** need the Edge browser — both
stores are submitted through a website and accept the same Chromium MV3 package.

---

## 0. Build the upload package

```powershell
powershell -ExecutionPolicy Bypass -File store_assets\package.ps1
```

This produces `tabbatch-pdf.zip` (manifest + icons + lib + src only — no
`node_modules`, tests, or docs). Re-run it whenever you change the extension.

> Bump the `version` in `manifest.json` (and `package.json`) before every new
> upload — stores reject a re-upload with the same version number.

---

## 1. Prepare store images

Open `store_assets/screenshot-framer.html` in any browser. For each image:
choose a preset, drop in a screenshot (or just use the logo/promo presets), tweak
the caption, and click **Download PNG**.

| Asset | Size | Edge | Chrome |
|---|---|---|---|
| App/store logo | 300×300 (Edge), 128×128 (Chrome) | required | required |
| Screenshot(s) | 1280×800 (or 640×400) | 1+ required | 1+ required |
| Small promo tile | 440×280 | optional | optional |
| Marquee promo | 1400×560 | — | optional |

Take raw screenshots of the **popup** and the **manager** (use `Win + Shift + S`),
then frame them to 1280×800 with the tool. Three or four screenshots is ideal:
the popup tab-picker, the manager grid, the merge options, and the settings page.

`icons/icon128.png` and `store_assets/icon300.png` are ready to upload as-is.

---

## 2. Microsoft Edge Add-ons (free)

**You can do all of this from Chrome.**

1. Go to **https://partner.microsoft.com/dashboard/microsoftedge** and sign in
   with any Microsoft account. Registration is free (no fee).
2. Complete the one-time developer profile (name, etc.).
3. Click **New extension** → upload `tabbatch-pdf.zip`.
4. Fill in the listing using `store_assets/STORE_LISTING.md`:
   - **Name**, **Short description**, **Detailed description**
   - **Store logo** → `store_assets/icon300.png`
   - **Screenshots** → your 1280×800 PNGs
   - **Category**: Productivity · **Language**: English
   - **Privacy policy URL**: link to `PRIVACY.md` on GitHub, e.g.
     `https://github.com/shahriar-ahmed-seam/tabbatch-pdf/blob/main/PRIVACY.md`
5. **Properties → Permissions justification**: paste the justification block from
   `STORE_LISTING.md`. The `debugger` permission *will* be questioned — the
   explanation is already written there.
6. **Data collection**: select **No data collected** (everything is local).
7. Submit. Edge review typically takes a few hours to a few days.

## 3. Chrome Web Store ($5 one-time)

1. Go to **https://chrome.google.com/webstore/devconsole** and sign in.
2. Pay the **one-time $5** developer registration fee (first time only).
3. **Add new item** → upload `tabbatch-pdf.zip`.
4. Fill the listing from `STORE_LISTING.md`; icon is `icons/icon128.png`,
   screenshots 1280×800.
5. **Privacy practices tab**: declare single purpose (text in `STORE_LISTING.md`),
   justify each permission, and certify no data is sold/transferred.
6. Submit for review.

---

## 4. After approval

- Tag the release in git and attach the same zip (already automated via
  `gh release create`).
- For updates: bump the version, re-run `package.ps1`, upload the new zip, and
  resubmit.

## Notes & gotchas

- **`debugger` permission** is the #1 review question on both stores. Keep the
  justification factual: it is the only API that yields true vector PDFs
  (`Page.printToPDF`), and it is only attached to tabs the user explicitly picks.
- **`<all_urls>`**: justified because the user may capture any site they choose;
  the extension never acts on a tab automatically.
- Both stores require a reachable **privacy policy URL** — the GitHub link works.
- Firefox is **not** supported (it lacks `chrome.debugger` printing).
