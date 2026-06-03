import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');

test.describe('New Tab Shortcuts Extension', () => {
  let context;
  let page;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext({
      permissions: ['storage'],
    });
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

  test('newtab.html shows the add group button', async () => {
    await page.goto(`file://${extensionPath}/newtab.html`);
    await expect(page.locator('#add-group-btn')).toBeVisible();
    await expect(page.locator('#add-group-btn')).toHaveText('+ New group');
  });
});
