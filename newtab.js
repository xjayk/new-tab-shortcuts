/**
 * newtab.js — UI logic for the New Tab page.
 *
 * Architecture: single render(state) function drives all DOM output.
 * No virtual DOM, no framework. One delegated click listener set up
 * at boot — never re-attached on re-renders, so it can't accumulate.
 */

import { init, saveAll, onChange, newId } from './storage.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state = { version: 1, groups: [] };

/**
 * syncReady = true once it is safe to show real content.
 *
 * On a device with a populated local cache, we flip it immediately so
 * returning users see their shortcuts without any delay.
 * On a fresh device (empty local cache), we keep it false until the
 * chrome.storage.sync round-trip completes, showing a skeleton instead
 * of a misleading empty state.
 */
let syncReady = false;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  const root = document.getElementById('app');

  if (!syncReady) {
    renderSkeleton(root);
    return;
  }

  if (state.groups.length === 0) {
    renderEmpty(root);
  } else {
    renderGroups(root);
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

function renderGroups(root) {
  // Only update innerHTML — the delegated click listener lives on #app
  // and is attached once at boot, so it survives innerHTML replacement.
  root.innerHTML = state.groups.map(group => groupHTML(group)).join('');
}

function groupHTML(group) {
  const tiles = group.shortcuts.map(s => tileHTML(s, group.id)).join('');
  return `
    <section class="group" data-group-id="${group.id}">
      <header class="group-header">
        <span class="group-name" data-action="rename-group" data-group-id="${group.id}">${escHtml(group.name)}</span>
        <div class="group-actions">
          <button class="icon-btn" title="Add shortcut" data-action="add-shortcut" data-group-id="${group.id}">+</button>
          <button class="icon-btn danger" title="Delete group" data-action="delete-group" data-group-id="${group.id}">✕</button>
        </div>
      </header>
      <div class="tiles">
        ${tiles}
        <button class="tile tile-add" data-action="add-shortcut" data-group-id="${group.id}" title="Add shortcut">
          <span class="tile-add-icon">+</span>
        </button>
      </div>
    </section>`;
}

function tileHTML(shortcut, groupId) {
  const initial = (shortcut.name || shortcut.url).charAt(0).toUpperCase();
  const colorIndex = Math.abs(hashStr(shortcut.id)) % ACCENT_COLORS.length;
  const color = ACCENT_COLORS[colorIndex];
  return `
    <a class="tile" href="${escAttr(shortcut.url)}" data-shortcut-id="${shortcut.id}" data-group-id="${groupId}">
      <span class="tile-icon" style="background:${color}">${escHtml(initial)}</span>
      <span class="tile-name">${escHtml(shortcut.name)}</span>
      <button class="tile-delete icon-btn danger" data-action="delete-shortcut"
              data-shortcut-id="${shortcut.id}" data-group-id="${groupId}"
              title="Remove shortcut" tabindex="-1">✕</button>
    </a>`;
}

// ---------------------------------------------------------------------------
// Single delegated click listener — attached ONCE at boot.
// Survives innerHTML replacement because it is bound to #app itself.
// ---------------------------------------------------------------------------

function initEventDelegation() {
  const root = document.getElementById('app');
  root.addEventListener('click', handleClick);
}

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action     = btn.dataset.action;
  const groupId    = btn.dataset.groupId;
  const shortcutId = btn.dataset.shortcutId;

  if (action === 'add-shortcut') {
    e.preventDefault();
    openAddModal(groupId);
  } else if (action === 'delete-shortcut') {
    e.preventDefault();
    e.stopPropagation();
    deleteShortcut(groupId, shortcutId);
  } else if (action === 'delete-group') {
    e.preventDefault();
    deleteGroup(groupId);
  } else if (action === 'rename-group') {
    e.preventDefault();
    startRename(btn, groupId);
  }
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function initToolbar() {
  document.getElementById('add-group-btn').addEventListener('click', () => promptAddGroup());
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
  if (hasShortcuts && !confirm(`Delete group "${group.name}" and its ${group.shortcuts.length} shortcut(s)?`)) return;
  state = { ...state, groups: state.groups.filter(g => g.id !== groupId) };
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

function openAddModal(groupId) {
  const existing = document.getElementById('shortcut-modal');
  if (existing) existing.remove();

  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;

  const modal = document.createElement('div');
  modal.id = 'shortcut-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Add shortcut">
      <h2 class="modal-title">Add shortcut</h2>
      <label class="field-label" for="sc-name">Name</label>
      <input id="sc-name" class="field-input" type="text" placeholder="e.g. GitHub" maxlength="80" autocomplete="off" />
      <label class="field-label" for="sc-url">URL</label>
      <input id="sc-url" class="field-input" type="url" placeholder="https://github.com" autocomplete="off" />
      <p id="sc-error" class="field-error" aria-live="polite"></p>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="sc-cancel">Cancel</button>
        <button class="btn btn-primary" id="sc-save">Add shortcut</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const nameInput = document.getElementById('sc-name');
  const urlInput  = document.getElementById('sc-url');
  const errEl     = document.getElementById('sc-error');
  nameInput.focus();

  document.getElementById('sc-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.getElementById('sc-save').addEventListener('click', () => saveShortcut(groupId, nameInput, urlInput, errEl));

  [nameInput, urlInput].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter')  saveShortcut(groupId, nameInput, urlInput, errEl);
      if (e.key === 'Escape') closeModal();
    });
  });
}

function saveShortcut(groupId, nameInput, urlInput, errEl) {
  errEl.textContent = '';
  let url = urlInput.value.trim();
  const name = nameInput.value.trim();

  if (!url) { errEl.textContent = 'URL is required.'; urlInput.focus(); return; }

  // Auto-prepend https:// if no protocol given
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) {
    url = 'https://' + url;
  }

  try { new URL(url); } catch {
    errEl.textContent = 'Please enter a valid URL.';
    urlInput.focus();
    return;
  }

  const shortcut = { id: newId(), name: name || url, url };

  state = {
    ...state,
    groups: state.groups.map(g =>
      g.id === groupId ? { ...g, shortcuts: [...g.shortcuts, shortcut] } : g
    ),
  };

  closeModal();
  persist();
}

function deleteShortcut(groupId, shortcutId) {
  state = {
    ...state,
    groups: state.groups.map(g =>
      g.id === groupId
        ? { ...g, shortcuts: g.shortcuts.filter(s => s.id !== shortcutId) }
        : g
    ),
  };
  persist();
}

function closeModal() {
  const modal = document.getElementById('shortcut-modal');
  if (modal) {
    modal.classList.add('modal-closing');
    modal.addEventListener('animationend', () => modal.remove(), { once: true });
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persist() {
  render();
  await saveAll(state);
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
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initToolbar();
  initEventDelegation(); // one listener, attached once, never re-added
  render();              // renders skeleton immediately (syncReady = false)

  init(
    // ── Local cache callback (instant) ───────────────────────────────────
    // Only flip syncReady if local storage already has data.
    // On a fresh device (empty cache), keep showing skeleton so the user
    // never sees a misleading empty state before sync resolves.
    localState => {
      state = localState;
      if (localState.groups.length > 0) {
        syncReady = true;
        render();
      }
      // else: stay in skeleton mode until sync callback fires below
    },

    // ── Sync callback (cross-device, arrives after ~100–500 ms) ──────────
    // Always set syncReady here — this is the authoritative data source.
    syncState => {
      state = syncState;
      syncReady = true;
      render();
    }
  );

  // Live updates while this tab is open (another device wrote)
  onChange(syncState => {
    state = syncState;
    render();
  });
});
