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
