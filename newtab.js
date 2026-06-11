/**
 * newtab.js — UI logic for the New Tab page.
 *
 * Architecture: single render(state) function drives all DOM output.
 * No virtual DOM, no framework. One delegated click listener set up
 * at boot — never re-attached on re-renders, so it can't accumulate.
 */

import { init, saveAll, onChange, newId, validate, saveBackground, readBackground, clearBackground, saveBackgroundSize, readBackgroundSize } from './storage.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state = { version: 1, groups: [], shortcuts: [] };

let syncReady = false;

// ---------------------------------------------------------------------------
// Cached DOM references — resolved once at boot
// ---------------------------------------------------------------------------

let $app;
let $addGroupBtn;
let $shortcutBtn;
let $importBtn;
let $exportBtn;
let $editCheckbox;
let $modal = null;
let $bgBtn;
let $clearBgBtn;
let $bgSizeSelect;
let $bgFileInput;

// ---------------------------------------------------------------------------
// Debounce utility
// ---------------------------------------------------------------------------

function debounce(fn, ms) {
  let timer;
  let lastArgs;
  const debounced = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => fn(...lastArgs), ms);
  };
  debounced.cancel = () => { clearTimeout(timer); timer = null; };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

const debouncedSave = debounce(saveAll, 400);

// ---------------------------------------------------------------------------
// Self-write guard — skip onChange echo from our own writes
// ---------------------------------------------------------------------------

const writtenStates = new Set();

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

let editMode = false;

/** Tracks whether a user-set background image is active (persists across edit-mode toggles). */
let hasBackground = false;

/**
 * setEditMode(next) — single source of truth for edit mode state.
 * NEVER writes back to $editCheckbox.checked here; the checkbox drives us,
 * not the other way around (avoids a change-event feedback loop).
 */
function setEditMode(next) {
  editMode = next;
  $importBtn.hidden    = !editMode;
  $exportBtn.hidden    = !editMode;
  $shortcutBtn.hidden  = !editMode;
  $addGroupBtn.hidden  = !editMode;
  $bgBtn.hidden        = !editMode;
  $clearBgBtn.hidden   = !editMode || !hasBackground;
  $bgSizeSelect.hidden = !editMode || !hasBackground;
  closeAllTileMenus();
  render();
}

// ---------------------------------------------------------------------------
// Edit-gated actions — module-scoped Set for O(1) lookup
// ---------------------------------------------------------------------------

const EDIT_ACTIONS = new Set([
  'add-shortcut',
  'edit-shortcut',
  'delete-shortcut',
  'delete-group',
  'rename-group',
  'tile-menu',
  'duplicate-shortcut',
]);

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  if (!syncReady) {
    renderSkeleton($app);
    return;
  }

  if (state.groups.length === 0 && state.shortcuts.length === 0) {
    renderEmpty($app);
  } else {
    renderGroups($app);
  }
}

function renderSkeleton(root) {
  root.innerHTML = `
    <div class="skeleton-wrap">
      <div class="skeleton-group">
        <div class="skeleton-label"></div>
        <div class="skeleton-tiles">
          <div class="skeleton-tile"></div>
          <div class="skeleton-tile"></div>
          <div class="skeleton-tile"></div>
        </div>
      </div>
      <div class="skeleton-group">
        <div class="skeleton-label"></div>
        <div class="skeleton-tiles">
          <div class="skeleton-tile"></div>
          <div class="skeleton-tile"></div>
        </div>
      </div>
    </div>`;
}

function renderEmpty(root) {
  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-title">Your new tab, your way.</p>
      <p class="empty-sub">Create a group to get started.</p>
      <button class="btn btn-primary" id="empty-add-group">+ New group</button>
    </div>`;
  document.getElementById('empty-add-group').addEventListener('click', () => promptAddGroup());
}

// ---------------------------------------------------------------------------
// Surgical DOM patching via data-group-id
// ---------------------------------------------------------------------------

function renderGroups(root) {
  const UNGROUPED_ID = '__ungrouped__';
  const existingEls = new Map();
  for (const child of [...root.children]) {
    const gid = child.dataset?.groupId;
    if (gid) {
      existingEls.set(gid, child);
    } else {
      child.remove();
    }
  }

  const activeIds = new Set(state.groups.map(g => g.id));
  if (state.shortcuts.length > 0) activeIds.add(UNGROUPED_ID);
  for (const [gid, child] of existingEls) {
    if (!activeIds.has(gid)) {
      child.remove();
      existingEls.delete(gid);
    }
  }

  state.groups.forEach((group, index) => {
    const newHtml = groupHTML(group);
    const existingChild = existingEls.get(group.id);

    if (existingChild) {
      const groupStateStr = JSON.stringify(group) + String(editMode);
      if (existingChild._groupState !== groupStateStr) {
        const temp = document.createElement('div');
        temp.innerHTML = newHtml;
        const newChild = temp.firstElementChild;
        newChild._groupState = groupStateStr;
        existingChild.replaceWith(newChild);
        existingEls.set(group.id, newChild);
      }

      const updatedChild = existingEls.get(group.id);
      const currentChildAtIndex = root.children[index];
      if (currentChildAtIndex !== updatedChild) {
        root.insertBefore(updatedChild, currentChildAtIndex || null);
      }
    } else {
      const temp = document.createElement('div');
      temp.innerHTML = newHtml;
      const newChild = temp.firstElementChild;
      newChild._groupState = JSON.stringify(group) + String(editMode);

      const currentChildAtIndex = root.children[index];
      root.insertBefore(newChild, currentChildAtIndex || null);
      existingEls.set(group.id, newChild);
    }
  });

  if (state.shortcuts.length > 0) {
    const ungroupedHtml = ungroupedHTML();
    const existingUngrouped = existingEls.get(UNGROUPED_ID);
    const ungroupedStateStr = JSON.stringify(state.shortcuts) + String(editMode);
    if (existingUngrouped) {
      if (existingUngrouped._groupState !== ungroupedStateStr) {
        const temp = document.createElement('div');
        temp.innerHTML = ungroupedHtml;
        const newChild = temp.firstElementChild;
        newChild._groupState = ungroupedStateStr;
        existingUngrouped.replaceWith(newChild);
        existingEls.set(UNGROUPED_ID, newChild);
      }
      const updatedChild = existingEls.get(UNGROUPED_ID);
      root.appendChild(updatedChild);
    } else {
      const temp = document.createElement('div');
      temp.innerHTML = ungroupedHtml;
      const newChild = temp.firstElementChild;
      newChild._groupState = ungroupedStateStr;
      root.appendChild(newChild);
      existingEls.set(UNGROUPED_ID, newChild);
    }
  }
  loadTileFavicons(root);
}

function groupHTML(group) {
  const tiles = group.shortcuts.map(s => tileHTML(s, group.id)).join('');
  const actions = editMode
    ? `<div class="group-actions">
        <button class="icon-btn" title="Add shortcut" data-action="add-shortcut" data-group-id="${group.id}">+</button>
        <button class="icon-btn danger" title="Delete group" data-action="delete-group" data-group-id="${group.id}">✕</button>
      </div>`
    : '';
  const addTile = editMode
    ? `<button class="tile tile-add" data-action="add-shortcut" data-group-id="${group.id}" title="Add shortcut">
        <span class="tile-add-icon">+</span>
      </button>`
    : '';
  return `
    <section class="group" data-group-id="${group.id}">
      <header class="group-header">
        <span class="group-name" data-action="rename-group" data-group-id="${group.id}">${escHtml(group.name)}</span>
        ${actions}
      </header>
      <div class="tiles">
        ${tiles}
        ${addTile}
      </div>
    </section>`;
}

function ungroupedHTML() {
  const tiles = state.shortcuts.map(s => tileHTML(s, '')).join('');
  return `
    <section class="group ungrouped" data-group-id="__ungrouped__">
      <div class="tiles">
        ${tiles}
        <button class="tile tile-add" data-action="add-shortcut" title="Add shortcut">
          <span class="tile-add-icon">+</span>
        </button>
      </div>
    </section>`;
}

function domainFromUrl(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Favicon loading via off-screen Image probes
// ---------------------------------------------------------------------------

const _faviconCache = new Map();

function loadTileFavicons(root) {
  root.querySelectorAll('.tile-favicon[data-favicon="pending"]').forEach(el => {
    const domain = el.dataset.domain;
    if (!domain) return;
    el.dataset.favicon = 'loading';
    loadFaviconForEl(el, domain);
  });
}

function loadFaviconForEl(imgEl, domain) {
  const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  const ddgUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

  if (_faviconCache.has(domain)) {
    const url = _faviconCache.get(domain);
    if (url) {
      imgEl.src = url;
    } else {
      imgEl.style.display = 'none';
      imgEl.parentElement.classList.add('tile-icon--fallback');
    }
    return;
  }

  const tryDdg = () => {
    const probe = new Image();
    probe.onload = () => {
      _faviconCache.set(domain, ddgUrl);
      imgEl.src = ddgUrl;
    };
    probe.onerror = () => {
      _faviconCache.set(domain, null);
      imgEl.style.display = 'none';
      imgEl.parentElement.classList.add('tile-icon--fallback');
    };
    probe.src = ddgUrl;
  };

  const probe = new Image();
  probe.onload = () => {
    if (probe.naturalWidth <= 16) {
      tryDdg();
    } else {
      _faviconCache.set(domain, googleUrl);
      imgEl.src = googleUrl;
    }
  };
  probe.onerror = tryDdg;
  probe.src = googleUrl;
}

function tileHTML(shortcut, groupId) {
  const initial = (shortcut.name || shortcut.url).charAt(0).toUpperCase();
  const colorIndex = Math.abs(hashStr(shortcut.id)) % ACCENT_COLORS.length;
  const color = ACCENT_COLORS[colorIndex];
  const domain = domainFromUrl(shortcut.url);
  const menu = editMode
    ? `<span class="tile-menu">
        <button class="tile-menu-btn" data-action="tile-menu" data-shortcut-id="${shortcut.id}" data-group-id="${groupId}"
                title="More" tabindex="-1">⋮</button>
        <div class="tile-dropdown">
          <button class="tile-dropdown-item" data-action="edit-shortcut"
                  data-shortcut-id="${shortcut.id}" data-group-id="${groupId}">Edit</button>
          <button class="tile-dropdown-item" data-action="duplicate-shortcut"
                  data-shortcut-id="${shortcut.id}" data-group-id="${groupId}">Duplicate</button>
          <button class="tile-dropdown-item danger" data-action="delete-shortcut"
                  data-shortcut-id="${shortcut.id}" data-group-id="${groupId}">Delete</button>
        </div>
      </span>`
    : '';
  return `
    <a class="tile" href="${escAttr(shortcut.url)}" data-shortcut-id="${shortcut.id}" data-group-id="${groupId}"${editMode ? ' target="_blank" rel="noopener"' : ''}>
      <span class="tile-icon">
        <img class="tile-favicon" data-domain="${escAttr(domain)}" data-favicon="pending" alt="">
        <span class="tile-fallback" style="background:${color}">${escHtml(initial)}</span>
      </span>
      <span class="tile-name">${escHtml(shortcut.name)}</span>
      ${menu}
    </a>`;
}

// ---------------------------------------------------------------------------
// Single delegated click listener — attached ONCE at boot.
// ---------------------------------------------------------------------------

function initEventDelegation() {
  $app.addEventListener('click', handleClick);
}

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action     = btn.dataset.action;
  const groupId    = btn.dataset.groupId;
  const shortcutId = btn.dataset.shortcutId;

  if (EDIT_ACTIONS.has(action) && !editMode) return;

  if (action === 'add-shortcut') {
    e.preventDefault();
    openAddModal(groupId);
  } else if (action === 'delete-shortcut') {
    e.preventDefault();
    e.stopPropagation();
    closeAllTileMenus();
    deleteShortcut(groupId, shortcutId);
  } else if (action === 'delete-group') {
    e.preventDefault();
    deleteGroup(groupId);
  } else if (action === 'rename-group') {
    e.preventDefault();
    startRename(btn, groupId);
  } else if (action === 'tile-menu') {
    e.preventDefault();
    e.stopPropagation();
    toggleTileMenu(btn);
  } else if (action === 'duplicate-shortcut') {
    e.preventDefault();
    e.stopPropagation();
    closeAllTileMenus();
    duplicateShortcut(groupId, shortcutId);
  } else if (action === 'edit-shortcut') {
    e.preventDefault();
    e.stopPropagation();
    closeAllTileMenus();
    openAddModal(groupId, shortcutId);
  }
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function initToolbar() {
  // Checkbox is the source of truth — read its value, call setEditMode.
  // We do NOT write back to $editCheckbox.checked inside setEditMode()
  // to avoid triggering another 'change' event (feedback loop).
  $editCheckbox.addEventListener('change', () => {
    setEditMode($editCheckbox.checked);
  });

  $addGroupBtn.addEventListener('click', () => promptAddGroup());
  $shortcutBtn.addEventListener('click', () => openAddModal());
  document.getElementById('export-btn').addEventListener('click', exportState);
  document.getElementById('import-btn').addEventListener('click', triggerImport);
  $exportBtn.addEventListener('click', exportState);
  $importBtn.addEventListener('click', triggerImport);
  $bgBtn.addEventListener('click', triggerBgPicker);
  $clearBgBtn.addEventListener('click', clearBg);
  $bgSizeSelect.addEventListener('change', handleBgSizeChange);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.id = 'import-file-input';
  fileInput.addEventListener('change', handleImportFile);
  document.body.appendChild(fileInput);

  $bgFileInput = document.createElement('input');
  $bgFileInput.type = 'file';
  $bgFileInput.accept = 'image/*';
  $bgFileInput.style.display = 'none';
  $bgFileInput.id = 'bg-file-input';
  $bgFileInput.addEventListener('change', handleBgFile);
  document.body.appendChild($bgFileInput);
}

// ---------------------------------------------------------------------------
// Group operations
// ---------------------------------------------------------------------------

function promptAddGroup() {
  const name = prompt('Group name:');
  if (!name || !name.trim()) return;
  const group = { id: newId(), name: name.trim(), shortcuts: [] };
  state = { ...state, groups: [...state.groups, group] };
  persist();
}

function deleteGroup(groupId) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;
  const hasShortcuts = group.shortcuts.length > 0;

  if (hasShortcuts) {
    const keep = confirm(
      `Delete group "${group.name}"?\n` +
      `• OK → move ${group.shortcuts.length} shortcut(s) to ungrouped\n` +
      `• Cancel → delete group AND its shortcuts`
    );
    if (keep) {
      state = {
        ...state,
        shortcuts: [...state.shortcuts, ...group.shortcuts],
        groups: state.groups.filter(g => g.id !== groupId),
      };
    } else {
      if (!confirm(`Permanently delete "${group.name}" and all ${group.shortcuts.length} shortcuts?`)) return;
      state = { ...state, groups: state.groups.filter(g => g.id !== groupId) };
    }
  } else {
    state = { ...state, groups: state.groups.filter(g => g.id !== groupId) };
  }
  persist();
}

function startRename(el, groupId) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;

  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = group.name;
  input.maxLength = 60;
  el.replaceWith(input);
  input.focus();
  input.select();

  function commit() {
    const newName = input.value.trim();
    if (newName && newName !== group.name) {
      state = {
        ...state,
        groups: state.groups.map(g =>
          g.id === groupId ? { ...g, name: newName } : g
        ),
      };
      persist();
    } else {
      render();
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.removeEventListener('blur', commit); render(); }
  });
}

// ---------------------------------------------------------------------------
// Shortcut operations
// ---------------------------------------------------------------------------

function openAddModal(groupId, shortcutId) {
  if ($modal) $modal.remove();

  if (groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
  }

  const editing = !!shortcutId;
  let existing = null;
  if (editing) {
    if (groupId) {
      const group = state.groups.find(g => g.id === groupId);
      existing = group?.shortcuts.find(s => s.id === shortcutId) ?? null;
    } else {
      existing = state.shortcuts.find(s => s.id === shortcutId) ?? null;
    }
    if (!existing) return;
  }

  const title = editing ? 'Edit shortcut' : 'Add shortcut';
  const saveLabel = editing ? 'Save changes' : 'Add shortcut';

  $modal = document.createElement('div');
  $modal.id = 'shortcut-modal';
  $modal.className = 'modal-overlay';
  $modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <h2 class="modal-title">${title}</h2>
      <label class="field-label" for="sc-name">Name</label>
      <input id="sc-name" class="field-input" type="text" placeholder="e.g. GitHub" maxlength="80" autocomplete="off" />
      <label class="field-label" for="sc-url">URL</label>
      <input id="sc-url" class="field-input" type="url" placeholder="https://github.com" autocomplete="off" />
      <p id="sc-error" class="field-error" aria-live="polite"></p>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="sc-cancel">Cancel</button>
        <button class="btn btn-primary" id="sc-save">${saveLabel}</button>
      </div>
    </div>`;

  document.body.appendChild($modal);

  const nameInput = document.getElementById('sc-name');
  const urlInput  = document.getElementById('sc-url');
  const errEl     = document.getElementById('sc-error');

  if (editing) {
    nameInput.value = existing.name;
    urlInput.value  = existing.url;
  }

  nameInput.focus();

  document.getElementById('sc-cancel').addEventListener('click', closeModal);
  $modal.addEventListener('click', e => { if (e.target === $modal) closeModal(); });
  document.getElementById('sc-save').addEventListener('click', () => saveShortcut(groupId, nameInput, urlInput, errEl, shortcutId));

  [nameInput, urlInput].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter')  saveShortcut(groupId, nameInput, urlInput, errEl, shortcutId);
      if (e.key === 'Escape') closeModal();
    });
  });
}

function saveShortcut(groupId, nameInput, urlInput, errEl, shortcutId) {
  errEl.textContent = '';
  let url = urlInput.value.trim();
  const name = nameInput.value.trim();

  if (!url) { errEl.textContent = 'URL is required.'; urlInput.focus(); return; }

  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) {
    url = 'https://' + url;
  }

  let parsed;
  try { parsed = new URL(url); } catch {
    errEl.textContent = 'Please enter a valid URL.';
    urlInput.focus();
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    errEl.textContent = 'Only http and https URLs are allowed.';
    urlInput.focus();
    return;
  }

  if (shortcutId) {
    const update = { name: name || url, url };
    if (groupId) {
      state = {
        ...state,
        groups: state.groups.map(g =>
          g.id === groupId
            ? { ...g, shortcuts: g.shortcuts.map(s => s.id === shortcutId ? { ...s, ...update } : s) }
            : g
        ),
      };
    } else {
      state = {
        ...state,
        shortcuts: state.shortcuts.map(s => s.id === shortcutId ? { ...s, ...update } : s),
      };
    }
  } else {
    const shortcut = { id: newId(), name: name || url, url };
    if (groupId) {
      state = {
        ...state,
        groups: state.groups.map(g =>
          g.id === groupId ? { ...g, shortcuts: [...g.shortcuts, shortcut] } : g
        ),
      };
    } else {
      state = { ...state, shortcuts: [...state.shortcuts, shortcut] };
    }
  }

  closeModal();
  persist();
}

function deleteShortcut(groupId, shortcutId) {
  if (groupId) {
    state = {
      ...state,
      groups: state.groups.map(g =>
        g.id === groupId
          ? { ...g, shortcuts: g.shortcuts.filter(s => s.id !== shortcutId) }
          : g
      ),
    };
  } else {
    state = { ...state, shortcuts: state.shortcuts.filter(s => s.id !== shortcutId) };
  }
  persist();
}

function duplicateShortcut(groupId, shortcutId) {
  if (groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    const idx = group.shortcuts.findIndex(s => s.id === shortcutId);
    if (idx === -1) return;
    const original = group.shortcuts[idx];
    const copy = { ...original, id: newId(), name: `${original.name} (copy)` };
    const newShortcuts = [...group.shortcuts];
    newShortcuts.splice(idx + 1, 0, copy);
    state = {
      ...state,
      groups: state.groups.map(g =>
        g.id === groupId ? { ...g, shortcuts: newShortcuts } : g
      ),
    };
  } else {
    const idx = state.shortcuts.findIndex(s => s.id === shortcutId);
    if (idx === -1) return;
    const original = state.shortcuts[idx];
    const copy = { ...original, id: newId(), name: `${original.name} (copy)` };
    const newShortcuts = [...state.shortcuts];
    newShortcuts.splice(idx + 1, 0, copy);
    state = { ...state, shortcuts: newShortcuts };
  }
  persist();
}

function toggleTileMenu(btn) {
  const tileMenu = btn.closest('.tile-menu');
  if (!tileMenu) return;

  const open = tileMenu.querySelector('.tile-dropdown.open');
  if (open) {
    open.classList.remove('open');
    document.removeEventListener('click', closeOnOutsideClick);
    return;
  }

  closeAllTileMenus();
  const dropdown = tileMenu.querySelector('.tile-dropdown');
  if (!dropdown) return;

  dropdown.classList.add('open');
  document.addEventListener('click', closeOnOutsideClick);
}

function closeAllTileMenus() {
  document.querySelectorAll('.tile-dropdown.open').forEach(d => d.classList.remove('open'));
  document.removeEventListener('click', closeOnOutsideClick);
}

function closeOnOutsideClick(e) {
  if (!e.target.closest('.tile-menu')) {
    closeAllTileMenus();
  }
}

function closeModal() {
  const modalToClose = $modal;
  if (!modalToClose) return;
  modalToClose.classList.add('modal-closing');
  const cleanup = () => {
    if (modalToClose && modalToClose.isConnected) {
      modalToClose.remove();
      if ($modal === modalToClose) $modal = null;
    }
  };
  const styles = window.getComputedStyle(modalToClose);
  const hasAnimation = styles.animationName
    && styles.animationName !== 'none'
    && styles.animationDuration !== '0s';
  if (hasAnimation) {
    modalToClose.addEventListener('animationend', cleanup, { once: true });
  } else {
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persist() {
  render();
  const stateStr = JSON.stringify(state);
  writtenStates.add(stateStr);
  if (writtenStates.size > 10) {
    const oldest = writtenStates.keys().next().value;
    writtenStates.delete(oldest);
  }
  debouncedSave(state);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCENT_COLORS = [
  '#4f6ef7', '#e05a6a', '#2db37d', '#e0993a',
  '#9b59b6', '#1abc9c', '#e67e22', '#3498db',
];

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) { return escHtml(str); }

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().split('T')[0];
  a.download = `shortcuts-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerImport() {
  const input = document.getElementById('import-file-input');
  input.value = '';
  input.click();
}

function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener('load', evt => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (
        !parsed || typeof parsed !== 'object'
        || typeof parsed.version !== 'number'
        || !Array.isArray(parsed.groups)
      ) {
        throw new Error('Invalid backup format');
      }
      const validated = validate(parsed);
      if (parsed.groups.length > 0 && validated.groups.length === 0) {
        throw new Error('Invalid backup format');
      }
      state = validated;
      persist();
      showToast('Import successful', 'success');
    } catch {
      showToast('Import failed: invalid file', 'error');
    }
  });
  reader.addEventListener('error', () => {
    showToast('Import failed: could not read file', 'error');
  });
  reader.readAsText(file);
}

function showToast(message, type) {
  const existing = document.getElementById('import-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'import-toast';
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fade');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 2500);
}

// ---------------------------------------------------------------------------
// Background image
// ---------------------------------------------------------------------------

function setBackgroundImage(dataUrl) {
  hasBackground = true;
  document.body.style.backgroundImage = `url("${dataUrl}")`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundRepeat = 'no-repeat';
  document.body.style.backgroundAttachment = 'fixed';
  $clearBgBtn.hidden  = !editMode;
  $bgSizeSelect.hidden = !editMode;
  if (!document.querySelector('.bg-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'bg-overlay';
    document.body.prepend(overlay);
  }
}

function applyBgSize(size) {
  document.body.style.backgroundSize = size;
}

function clearBg() {
  hasBackground = false;
  document.body.style.backgroundImage = '';
  document.body.style.backgroundSize = '';
  document.body.style.backgroundPosition = '';
  document.body.style.backgroundRepeat = '';
  document.body.style.backgroundAttachment = '';
  $clearBgBtn.hidden   = true;
  $bgSizeSelect.hidden = true;
  clearBackground();
  const overlay = document.querySelector('.bg-overlay');
  if (overlay) overlay.remove();
}

function handleBgFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', evt => {
    const dataUrl = evt.target.result;
    setBackgroundImage(dataUrl);
    saveBackground(dataUrl);
    const size = $bgSizeSelect.value;
    applyBgSize(size);
    saveBackgroundSize(size);
    showToast('Background set', 'success');
  });
  reader.addEventListener('error', () => {
    showToast('Could not read image', 'error');
  });
  reader.readAsDataURL(file);
  $bgFileInput.value = '';
}

function triggerBgPicker() {
  $bgFileInput.click();
}

function handleBgSizeChange() {
  const size = $bgSizeSelect.value;
  applyBgSize(size);
  saveBackgroundSize(size);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  $app          = document.getElementById('app');
  $addGroupBtn  = document.getElementById('add-group-btn');
  $shortcutBtn  = document.getElementById('add-shortcut-btn');
  $importBtn    = document.getElementById('import-btn');
  $exportBtn    = document.getElementById('export-btn');
  $editCheckbox = document.getElementById('edit-checkbox');
  $bgBtn        = document.getElementById('bg-btn');
  $clearBgBtn   = document.getElementById('clear-bg-btn');
  $bgSizeSelect = document.getElementById('bg-size');

  // Ensure all edit-only controls start hidden (belt + suspenders with HTML hidden attr)
  $addGroupBtn.hidden  = true;
  $shortcutBtn.hidden  = true;
  $importBtn.hidden    = true;
  $exportBtn.hidden    = true;
  $bgBtn.hidden        = true;
  $clearBgBtn.hidden   = true;
  $bgSizeSelect.hidden = true;
  $editCheckbox.checked = false;

  document.addEventListener('keydown', e => {
    if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = document.activeElement?.tagName;
      if (!['INPUT', 'TEXTAREA', 'A', 'BUTTON', 'SELECT'].includes(tag)
          && !document.activeElement?.closest('[contenteditable]')) {
        // Programmatically toggle checkbox then dispatch change so the single handler fires
        $editCheckbox.checked = !$editCheckbox.checked;
        $editCheckbox.dispatchEvent(new Event('change'));
      }
    }
    if (e.key === 'Escape' && editMode) {
      if (document.querySelector('.rename-input')) return;
      $editCheckbox.checked = false;
      $editCheckbox.dispatchEvent(new Event('change'));
    }
  });

  initToolbar();
  initEventDelegation();
  render();

  init(
    localState => {
      state = localState;
      if (localState.groups.length > 0) {
        syncReady = true;
        render();
      }
    },

    syncState => {
      state = syncState;
      syncReady = true;
      render();
    }
  );

  onChange(syncState => {
    const syncStateStr = JSON.stringify(syncState);
    if (writtenStates.has(syncStateStr)) return;
    debouncedSave.cancel();
    state = syncState;
    render();
  });

  // Load background image from local storage
  readBackground().then(dataUrl => {
    if (dataUrl) {
      setBackgroundImage(dataUrl);
      readBackgroundSize().then(size => {
        $bgSizeSelect.value = size;
        applyBgSize(size);
      });
    }
  });
});
