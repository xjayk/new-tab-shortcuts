# New Tab Shortcuts — Chrome Extension

A fast, minimal Chrome "New Tab" override with grouped shortcuts that sync automatically across all your devices.

## Features

- **Grouped shortcuts** — Organize bookmarks into named sections
- **Instant load** — Renders from local cache before sync resolves; no blank-page flash
- **Cross-device sync** — Uses Chrome's built-in sync storage (same Chrome account = same shortcuts everywhere)
- **Zero dependencies** — Pure HTML, CSS, and vanilla JS. No build step, no npm, no bundler.

## Install (Load Unpacked)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select this folder (the one containing `manifest.json`)
5. Open a new tab — you should see the custom page immediately

That's it. No build step required.

## Usage

| Action | How |
|---|---|
| Add a group | Click **"+ New group"** in the toolbar (or the button on the empty state) |
| Rename a group | Click the group's name label |
| Delete a group | Hover the group → click **✕** next to the group name |
| Add a shortcut | Click **+** next to a group header, or the dashed **+** tile inside a group |
| Delete a shortcut | Hover a shortcut tile → click the **✕** that appears |

## How Sync Works

Data is stored in two places simultaneously:

| Store | Purpose |
|---|---|
| `chrome.storage.local` | Instant-read cache — the page reads this on every tab open, so it renders before any network round-trip |
| `chrome.storage.sync` | Source of truth — syncs automatically across devices logged into the same Chrome profile |

**On first load on a new device:** the page shows a skeleton for ~100–300 ms while sync data is fetched, then renders your shortcuts. On subsequent loads, the local cache makes rendering instant.

**Storage limits:** `chrome.storage.sync` allows up to 100 KB of data and 512 items. This is more than enough for hundreds of shortcuts.

## File Structure

```
├── manifest.json     ← Chrome extension manifest (MV3)
├── newtab.html       ← New tab page entry point (inline critical CSS)
├── newtab.css        ← Full stylesheet (loaded non-blocking)
├── newtab.js         ← UI rendering and event handling (ES module)
├── storage.js        ← Dual-layer storage abstraction
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
├── AGENT.md          ← AI coding agent context
└── package.json
```

## Architecture Notes

- **No framework** — Vanilla JS with a single `render(state)` function. No virtual DOM. Fast and tiny.
- **ES modules** — `newtab.js` uses `import/export`. Chrome supports this natively; no bundler needed.
- **Instant-first rendering** — Critical CSS is inlined in `<style>` inside `newtab.html` so the skeleton appears before `newtab.css` is even fetched.
- **Event delegation** — A single click listener on the `#app` container handles all tile and group actions, keeping memory use minimal.
- **Idempotent render** — All DOM updates flow through one `render()` call; no incremental diffing complexity.

## Updating

To pull in changes, replace the extension files and click **"Update"** on the `chrome://extensions` page (or toggle the extension off and on).
