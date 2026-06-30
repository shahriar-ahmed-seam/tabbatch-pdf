# Privacy Policy — TabBatch PDF

_Last updated: June 30, 2026_

TabBatch PDF is built to be completely private. The short version: **everything happens on your device, and nothing is ever sent anywhere.**

## What data the extension handles

- **Page content** of the tabs you explicitly choose to capture, rendered into PDF files.
- **Tab metadata** (title, URL, favicon) used to build the capture list and label your PDFs.
- **Thumbnails** (optional) generated from the visible area of captured tabs.
- **Your settings** (capture mode, paper size, theme, etc.).

## Where it is stored

- Captured PDFs and thumbnails are stored locally in your browser's **IndexedDB**.
- Settings are stored via **`chrome.storage`** and may sync across your own Chrome profile through Google's built-in sync (if you have Chrome Sync enabled). This is handled entirely by Chrome, not by us.
- Finished PDFs are saved to your computer through the standard browser download flow.

## What is NOT collected

- ❌ No analytics, telemetry, or usage tracking.
- ❌ No accounts, sign-in, or personal identifiers.
- ❌ No remote servers — the extension makes **no outbound network requests** of its own.
- ❌ No selling or sharing of data, because no data is collected.

## Third-party code

The extension bundles [pdf-lib](https://pdf-lib.js.org/) **locally**. It is not loaded from any CDN and makes no network calls.

## Permissions

Every permission requested by the extension is used solely to capture and save the tabs you select. See the "Permissions — and why" table in the [README](README.md).

## Data deletion

You are always in control:

- Delete individual PDFs or click **Clear all** in the Manager.
- Removing the extension deletes all of its locally stored data.

## Contact

Questions? Open an issue on the GitHub repository.
