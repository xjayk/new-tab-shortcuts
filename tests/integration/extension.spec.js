import { test as base, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
});

async function openNewtab(context) {
  const page = await context.newPage();
  await page.goto('chrome://newtab');
  return page;
}

test.describe('New Tab Shortcuts Extension', () => {
  test('renders toolbar and JS executes', async ({ context }) => {
    const page = await openNewtab(context);

    await expect(page.locator('.toolbar-brand')).toHaveText('New Tab');

    await expect(page.locator('#import-btn')).toBeHidden();
    await expect(page.locator('#export-btn')).toBeHidden();
    await expect(page.locator('#add-group-btn')).toBeHidden();
    await expect(page.locator('#add-shortcut-btn')).toBeHidden();
    await expect(page.locator('#bg-btn')).toBeHidden();
    await expect(page.locator('#clear-bg-btn')).toBeHidden();
    await expect(page.locator('#bg-size')).toBeHidden();

    await expect(page.locator('#edit-toggle')).toBeVisible();
    await expect(page.locator('#edit-checkbox')).not.toBeChecked();
  });

  test('edit mode toggle shows/hides buttons', async ({ context }) => {
    const page = await openNewtab(context);

    await page.locator('.edit-toggle-label').click();
    await expect(page.locator('#import-btn')).toBeVisible();
    await expect(page.locator('#export-btn')).toBeVisible();
    await expect(page.locator('#add-group-btn')).toBeVisible();
    await expect(page.locator('#add-shortcut-btn')).toBeVisible();
    await expect(page.locator('#bg-btn')).toBeVisible();
    await expect(page.locator('#clear-bg-btn')).toBeHidden();
    await expect(page.locator('#bg-size')).toBeHidden();

    await page.locator('.edit-toggle-label').click();
    await expect(page.locator('#import-btn')).toBeHidden();
  });

  test('keyboard shortcut E toggles edit mode', async ({ context }) => {
    const page = await openNewtab(context);

    await page.keyboard.press('e');
    await expect(page.locator('#import-btn')).toBeVisible();

    await page.keyboard.press('E');
    await expect(page.locator('#import-btn')).toBeHidden();
  });

  test('Escape exits edit mode', async ({ context }) => {
    const page = await openNewtab(context);

    await page.locator('.edit-toggle-label').click();
    await expect(page.locator('#import-btn')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#import-btn')).toBeHidden();
  });

  test('empty state renders after sync completes', async ({ context }) => {
    const page = await openNewtab(context);

    await expect(page.locator('.empty-state')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.empty-state .btn')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('+ New group');
  });
});

test.describe('Keyboard navigation', () => {
  const TILE_HOST = 'https://keyboard.example.dev';
  const seededState = {
    version: 1,
    groups: [
      {
        id: 'g-1',
        name: 'Group 1',
        shortcuts: [
          { id: 's-1', name: 'Alpha', url: `${TILE_HOST}/alpha` },
          { id: 's-2', name: 'Bravo', url: `${TILE_HOST}/bravo` },
        ],
      },
      {
        id: 'g-2',
        name: 'Group 2',
        shortcuts: [
          { id: 's-3', name: 'Charlie', url: `${TILE_HOST}/charlie` },
          { id: 's-4', name: 'Delta', url: `${TILE_HOST}/delta` },
        ],
      },
    ],
    shortcuts: [{ id: 's-5', name: 'Echo', url: `${TILE_HOST}/echo` }],
  };

  async function seedTiles(page, state = seededState) {
    await page.evaluate(s => Promise.all([
      chrome.storage.sync.set({ newtab_data: s }),
      chrome.storage.local.set({ newtab_data: s }),
    ]), state);
    await page.reload();
    await expect(page.locator('.tile[href]')).toHaveCount(state.groups.flatMap(g => g.shortcuts).length + (state.shortcuts ?? []).length);
  }

  async function fulfillTiles(context) {
    await context.route(`${TILE_HOST}/**`, route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>tile</title>' }));
  }

  test('renders numeric badges in flat order across groups', async ({ context }) => {
    const page = await openNewtab(context);
    await seedTiles(page);

    const badges = page.locator('.tile-kbd');
    await expect(badges).toHaveCount(5);
    await expect(badges.nth(0)).toHaveText('1');
    await expect(badges.nth(1)).toHaveText('2');
    await expect(badges.nth(2)).toHaveText('3');
    await expect(badges.nth(3)).toHaveText('4');
    await expect(badges.nth(4)).toHaveText('5');
  });

  test('only the first 10 shortcuts get badges (0 maps to the 10th)', async ({ context }) => {
    const page = await openNewtab(context);
    const many = {
      version: 1,
      groups: [{
        id: 'g-big',
        name: 'Big',
        shortcuts: Array.from({ length: 12 }, (_, i) => ({
          id: `s-big-${i}`,
          name: `S${i}`,
          url: `${TILE_HOST}/${i}`,
        })),
      }],
      shortcuts: [],
    };
    await seedTiles(page, many);

    await expect(page.locator('.tile[href]')).toHaveCount(12);
    await expect(page.locator('.tile-kbd')).toHaveCount(10);
    await expect(page.locator('.tile-kbd').nth(0)).toHaveText('1');
    await expect(page.locator('.tile-kbd').nth(8)).toHaveText('9');
    await expect(page.locator('.tile-kbd').nth(9)).toHaveText('0');
  });

  test('key 1 activates the first shortcut in the current tab', async ({ context }) => {
    await fulfillTiles(context);
    const page = await openNewtab(context);
    await seedTiles(page);

    await page.keyboard.press('1');
    await page.waitForURL(`${TILE_HOST}/alpha`);
  });

  test('key 0 activates the 10th shortcut (counted flat)', async ({ context }) => {
    await fulfillTiles(context);
    const page = await openNewtab(context);
    const ten = {
      version: 1,
      groups: [{
        id: 'g-ten',
        name: 'Ten',
        shortcuts: Array.from({ length: 10 }, (_, i) => ({
          id: `s-t-${i}`,
          name: `S${i}`,
          url: `${TILE_HOST}/tile-${i}`,
        })),
      }],
      shortcuts: [],
    };
    await seedTiles(page, ten);

    await page.keyboard.press('0');
    await page.waitForURL(`${TILE_HOST}/tile-9`);
  });

  test('shift+key opens the shortcut in a new tab', async ({ context }) => {
    await fulfillTiles(context);
    const page = await openNewtab(context);
    await seedTiles(page);

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.keyboard.press('Shift+1'),
    ]);
    await newPage.waitForURL(`${TILE_HOST}/alpha`);
  });

  test('does not activate when an input is focused', async ({ context }) => {
    await fulfillTiles(context);
    const page = await openNewtab(context);
    await seedTiles(page);

    await page.evaluate(() => {
      const input = globalThis.document.createElement('input');
      input.id = 'guard-input';
      globalThis.document.body.appendChild(input);
      input.focus();
    });

    const before = page.url();
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    expect(page.url()).toBe(before);
  });
});

test.describe('Reordering shortcuts', () => {
  const TILE_HOST = 'https://reorder.example.dev';

  function groupState(groupNames, ungroupedNames = []) {
    return {
      version: 1,
      groups: [{
        id: 'g-1',
        name: 'Work',
        shortcuts: groupNames.map((name, i) => ({
          id: `gs-${i}`,
          name,
          url: `${TILE_HOST}/g-${i}`,
        })),
      }],
      shortcuts: ungroupedNames.map((name, i) => ({
        id: `u-${i}`,
        name,
        url: `${TILE_HOST}/u-${i}`,
      })),
    };
  }

  async function seed(page, state) {
    await page.evaluate(s => Promise.all([
      chrome.storage.sync.set({ newtab_data: s }),
      chrome.storage.local.set({ newtab_data: s }),
    ]), state);
    await page.reload();
    await expect(page.locator('.tile[href]')).toHaveCount(state.groups.flatMap(g => g.shortcuts).length + (state.shortcuts ?? []).length);
  }

  async function enterEditMode(page) {
    await page.locator('.edit-toggle-label').click();
    await expect(page.locator('#add-shortcut-btn')).toBeVisible();
  }

  async function openTileMenu(page, shortcutId) {
    await page.locator(`.tile[data-shortcut-id="${shortcutId}"] .tile-menu-btn`).click();
    await expect(page.locator(`.tile[data-shortcut-id="${shortcutId}"] .tile-dropdown`)).toHaveClass(/open/);
  }

  async function clickMove(page, shortcutId, action) {
    await openTileMenu(page, shortcutId);
    await page.locator(`.tile[data-shortcut-id="${shortcutId}"] .tile-dropdown .tile-dropdown-item[data-action="${action}"]`).click();
  }

  async function expectTileOrder(page, expectedNames) {
    await expect(page.locator('.tile-name')).toHaveText(expectedNames);
  }

  test('move controls only appear in edit mode', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Alpha', 'Bravo']));

    // Not in edit mode → no move controls in the DOM at all
    await expect(page.locator('[data-action="move-shortcut-left"], [data-action="move-shortcut-right"]')).toHaveCount(0);

    await enterEditMode(page);
    await expect(page.locator('[data-action="move-shortcut-left"]')).toHaveCount(2);
    await expect(page.locator('[data-action="move-shortcut-right"]')).toHaveCount(2);
  });

  test('moves a middle item left within its group and persists after reload', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Alpha', 'Bravo', 'Charlie']));
    await enterEditMode(page);

    await clickMove(page, 'gs-1', 'move-shortcut-left');
    await expectTileOrder(page, ['Bravo', 'Alpha', 'Charlie']);

    // Persisted order survives a fresh load
    await page.reload();
    await expectTileOrder(page, ['Bravo', 'Alpha', 'Charlie']);
  });

  test('moves an item right within its group', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Alpha', 'Bravo', 'Charlie']));
    await enterEditMode(page);

    await clickMove(page, 'gs-0', 'move-shortcut-right');
    await expectTileOrder(page, ['Bravo', 'Alpha', 'Charlie']);
  });

  test('moves items within the ungrouped section', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Alpha', 'Bravo'], ['Solo', 'Duo', 'Trio']));
    await enterEditMode(page);

    await clickMove(page, 'u-1', 'move-shortcut-left'); // 'Duo' → left
    await expectTileOrder(page, ['Alpha', 'Bravo', 'Duo', 'Solo', 'Trio']);

    await page.reload();
    await expectTileOrder(page, ['Alpha', 'Bravo', 'Duo', 'Solo', 'Trio']);
  });

  test('boundary controls are disabled for first and last items', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Alpha', 'Bravo', 'Charlie']));
    await enterEditMode(page);

    await openTileMenu(page, 'gs-0'); // first
    await expect(page.locator('.tile[data-shortcut-id="gs-0"] [data-action="move-shortcut-left"]')).toBeDisabled();
    await expect(page.locator('.tile[data-shortcut-id="gs-0"] [data-action="move-shortcut-right"]')).toBeEnabled();

    await openTileMenu(page, 'gs-2'); // last
    await expect(page.locator('.tile[data-shortcut-id="gs-2"] [data-action="move-shortcut-right"]')).toBeDisabled();
    await expect(page.locator('.tile[data-shortcut-id="gs-2"] [data-action="move-shortcut-left"]')).toBeEnabled();
  });

  test('single-item section omits move controls entirely', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Solo'], ['Only']));
    await enterEditMode(page);

    await expect(page.locator('.tile[data-shortcut-id="gs-0"] [data-action^="move-shortcut"]')).toHaveCount(0);
    await expect(page.locator('.tile[data-shortcut-id="u-0"] [data-action^="move-shortcut"]')).toHaveCount(0);
  });

  test('rapid successive moves keep a valid order with no loss or duplication', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Alpha', 'Bravo', 'Charlie', 'Delta']));
    await enterEditMode(page);

    // Move Alpha right three times quickly: Alpha, Bravo, Charlie, Delta → Bravo, Charlie, Delta, Alpha
    for (let i = 0; i < 3; i++) {
      await clickMove(page, 'gs-0', 'move-shortcut-right');
    }

    await expectTileOrder(page, ['Bravo', 'Charlie', 'Delta', 'Alpha']);
    await expect(page.locator('.tile[href]')).toHaveCount(4);

    await page.reload();
    await expectTileOrder(page, ['Bravo', 'Charlie', 'Delta', 'Alpha']);
  });

  test('out-of-bounds clicks (disabled control on boundary) leave order unchanged', async ({ context }) => {
    const page = await openNewtab(context);
    await seed(page, groupState(['Alpha', 'Bravo', 'Charlie']));
    await enterEditMode(page);

    await openTileMenu(page, 'gs-0'); // first item — Move left disabled
    await page.locator('.tile[data-shortcut-id="gs-0"] .tile-dropdown .tile-dropdown-item[data-action="move-shortcut-left"]').click({ force: true });

    await expectTileOrder(page, ['Alpha', 'Bravo', 'Charlie']);
    await page.reload();
    await expectTileOrder(page, ['Alpha', 'Bravo', 'Charlie']);
  });
});
