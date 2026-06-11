import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');

test.describe('New Tab Shortcuts Extension', () => {
  let context;
  let page;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('newtab.html renders the toolbar', async () => {
    await page.goto(`file://${extensionPath}/newtab.html`);
    await expect(page.locator('.toolbar')).toBeVisible();
    await expect(page.locator('.toolbar-brand')).toHaveText('New Tab');
  });

  test('newtab.html has edit-mode controls', async () => {
    await page.goto(`file://${extensionPath}/newtab.html`);

    // Action buttons are present in the DOM with correct labels
    await expect(page.locator('#add-group-btn')).toHaveText('+ group');
    await expect(page.locator('#import-btn')).toHaveText('import');
    await expect(page.locator('#export-btn')).toHaveText('export');
    await expect(page.locator('#bg-btn')).toHaveText('+ background');
    await expect(page.locator('#clear-bg-btn')).toHaveText('clear bg');
    await expect(page.locator('#bg-size')).toBeHidden();

    // All action buttons are hidden by default (view mode)
    await expect(page.locator('#add-group-btn')).toBeHidden();
    await expect(page.locator('#import-btn')).toBeHidden();
    await expect(page.locator('#export-btn')).toBeHidden();
    await expect(page.locator('#bg-btn')).toBeHidden();
    await expect(page.locator('#clear-bg-btn')).toBeHidden();

    // The edit toggle pill and its hidden checkbox exist
    await expect(page.locator('#edit-toggle')).toBeVisible();
    await expect(page.locator('.edit-toggle-label')).toHaveText('Edit');

    // The toolbar-left div groups the edit-mode buttons together
    await expect(page.locator('.toolbar-left')).toContainText('+ group');
  });
});
