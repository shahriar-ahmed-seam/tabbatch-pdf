# Changelog

All notable changes to TabBatch PDF are documented here. This project follows
[Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/) format.

## [2.0.0] — 2026-06-30

A complete, production-grade rewrite.

### Added
- **Tab picker** in the popup: choose exactly which tabs to capture, with
  favicons, select-all/none, and clear reasons for non-capturable pages.
- **All-windows scope** in addition to the current window.
- **Paged capture mode** with A4 / Letter / Legal / A3 / A5 / Tabloid sizes,
  portrait/landscape, and adjustable margins.
- **Settings page** (synced) for capture, preparation, thumbnail, notification,
  theme, and merge/export defaults.
- **Merge enhancements**: PDF bookmarks (outline), stamped page numbers, an
  optional clickable table-of-contents page, and document metadata.
- **Manager upgrades**: search, multi-select, batch delete, sort by
  title/date/size, inline rename, in-page preview, per-file download, and
  "download each".
- **Keyboard shortcut** (`Ctrl/⌘ + Shift + Y`) and **right-click menus**.
- **Light / dark / system theme** across all surfaces.
- **Smart oversize handling** — pages beyond a safe height fall back to paged.
- **Lazy-content loading** via auto-scroll, plus sticky header/footer removal.
- **53 automated tests** (utilities, settings model, IndexedDB layer).

### Changed
- Reorganised into a clean `src/` structure with shared ES modules.
- pdf-lib is now bundled locally (no CDN dependency) for offline use and CWS
  compliance.
- Robust, cancellable capture pipeline with per-tab timeouts, retries, and a
  service-worker keep-alive for large batches.
- Real, anti-aliased PNG icons at every required size.

### Fixed
- Restores the user's original active tab after capture.
- One failing tab no longer aborts the whole batch.
- Reliable IndexedDB ordering and reorder persistence.

## [1.0.0]
- Initial release: capture all tabs in the current window and merge to one PDF.
