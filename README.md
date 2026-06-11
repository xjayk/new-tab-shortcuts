# New Tab Shortcuts
A fast, minimal Chrome extension that replaces the new-tab page with grouped shortcuts that sync automatically across devices.

No build step. No framework. No dependencies.

## Quick Start

1. Clone or download this repository.
2. Open `chrome://extensions` → enable **Developer mode**.
3. Click **Load unpacked** → select the repository folder.
4. Open a new tab.

To run tests:
```bash
pnpm install
pnpm test          # Vitest unit tests
```

## Features

- **Grouped shortcuts** — organise bookmarks into named sections
- **Ungrouped shortcuts** — add shortcuts without a group
- **Edit mode** — toggle with the `Edit` pill or press `E`; `Escape` to exit
- **Tile menu** — edit, duplicate, or delete via the `⋮` hover menu
- **Favicons** — loaded from Chrome's built-in cache; no external requests
- **Background image** — set a custom background with cover / contain / auto sizing
- **Import / Export** — full JSON backup and restore

## Technical Highlights

* **Zero-Dependency Architecture:** Built entirely with vanilla JavaScript, HTML, and CSS to eliminate framework overhead and minimize parse/compile times.
* **Dual-Layer Storage Pipeline:** Implements a hybrid storage model querying `chrome.storage.local` for instant synchronous-feeling first paints, while background-reconciling with `chrome.storage.sync` for cross-device consistency.
* **Surgical DOM Patching:** Bypasses virtual DOM diffing penalties by utilizing specific `data-group-id` tracking to execute targeted DOM replacements only when specific group states mutate.
* **O(1) Event Delegation:** A single, root-level event listener manages all interactive states, preventing listener accumulation and memory bloat.
* **Optimized Asset Delivery:** Implements aggressive in-memory favicon caching and fallback generation to prevent redundant network requests.

## Privacy
Favicons are loaded via `chrome://favicon` — no domain data leaves the browser. No analytics, no telemetry, no external requests of any kind.
