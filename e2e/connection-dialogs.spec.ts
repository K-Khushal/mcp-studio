import { test, expect, type Page, type Locator } from '@playwright/test';
import { createConnection } from './helpers';
import AxeBuilder from '@axe-core/playwright';

// Reach every control by Tab; locator use only observes the focused control.
async function tabTo(page: Page, target: Locator) {
  for (let n = 0; n < 100; n++) {
    if (await target.evaluateAll(nodes => nodes.some(node => node === document.activeElement))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Control was not reachable by Tab: ${target}`);
}
async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press('Enter');
}

async function workspaceTo(page: Page, name: 'Auth' | 'Headers') {
  await tabTo(page, page.getByRole('tab', { selected: true }));
  await page.keyboard.down('Home');
  try { await expect(page.getByRole('tab', { name: 'Auth', exact: true })).toBeFocused(); }
  finally { await page.keyboard.up('Home'); }
  if (name === 'Headers') {
    await page.keyboard.down('ArrowRight');
    try { await expect(page.getByRole('tab', { name, exact: true })).toBeFocused(); }
    finally { await page.keyboard.up('ArrowRight'); }
  }
}

async function audit(page: Page, selector: string) {
  // Measure settled colors, rather than an overlay's opacity transition.
  await page.locator(selector).evaluateAll(async nodes => {
    await Promise.all(nodes.flatMap(node => node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  });
  expect((await new AxeBuilder({ page }).include(selector).analyze()).violations).toEqual([]);
}

// Radix selects on its deferred focus move while the arrow key is held.
async function arrowTo(page: Page, name: string) {
  await page.keyboard.down('ArrowRight');
  try { await expect(page.getByRole('radio', { name, exact: true })).toBeChecked(); }
  finally { await page.keyboard.up('ArrowRight'); }
}

test('connection and dialogs support a keyboard-only walkthrough', async ({ page }) => {
  // Saved Connection setup is outside this surface (sidebar is covered by #92).
  await createConnection(page, 'Keyboard Connection', 'Keyboard collection');
  await activate(page, page.getByRole('button', { name: 'Rename Connection Keyboard Connection', exact: true }));
  await page.keyboard.type('Renamed by keyboard');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Rename Connection Renamed by keyboard', exact: true })).toBeVisible();
  await audit(page, '.border-b.border-border.bg-card');
  await tabTo(page, page.getByRole('radio', { name: 'STDIO', exact: true }));
  await arrowTo(page, 'HTTP');
  await expect(page.getByRole('radio', { name: 'HTTP', exact: true })).toBeChecked();
  await workspaceTo(page, 'Auth');
  await tabTo(page, page.getByRole('radio', { name: 'None', exact: true }));
  await arrowTo(page, 'Bearer Token');
  await tabTo(page, page.getByLabel('Token', { exact: true }));
  await page.keyboard.type('synthetic-token');
  await audit(page, '[role=tabpanel]');
  await tabTo(page, page.getByRole('radio', { name: 'Bearer Token', exact: true }));
  await arrowTo(page, 'API Key');
  await tabTo(page, page.getByRole('radio', { name: 'Header', exact: true }));
  await arrowTo(page, 'Query Param');
  await expect(page.getByRole('radio', { name: 'Query Param', exact: true })).toBeChecked();
  await audit(page, '[role=tabpanel]');
  await workspaceTo(page, 'Headers');
  await activate(page, page.getByRole('button', { name: 'Add header', exact: true }));
  await tabTo(page, page.getByLabel('Header 1 name'));
  await page.keyboard.type('X-Trace');
  await expect(page.getByLabel('Header 1 name')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.type('example');
  await expect(page.getByLabel('Header 1 value')).toHaveValue('example');
  await activate(page, page.getByTitle('Active Environment', { exact: true }));
  await activate(page, page.getByRole('button', { name: 'New', exact: true }));
  await page.keyboard.type('Keyboard environment');
  await page.keyboard.press('Enter');
  await activate(page, page.getByRole('combobox', { name: 'Active Environment' }));
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.down('End');
  try { await expect(page.getByRole('option', { name: 'Keyboard environment', exact: true })).toBeFocused(); }
  finally { await page.keyboard.up('End'); }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Active Environment' })).toContainText('Keyboard environment');
  await tabTo(page, page.getByLabel('New Variable name'));
  await page.keyboard.type('HOST');
  await page.keyboard.press('Tab');
  await page.keyboard.type('localhost');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('HOST value')).toHaveValue('localhost');
  await audit(page, '[role=dialog]');
  await activate(page, page.getByRole('button', { name: 'Delete environment', exact: true }));
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await audit(page, '[role=alertdialog]');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Active Environment' })).toContainText('Keyboard environment');
  await page.keyboard.press('Escape');
  await activate(page, page.getByRole('button', { name: 'Settings', exact: true }));
  await tabTo(page, page.getByLabel('Call timeout in seconds'));
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('20');
  await tabTo(page, page.getByRole('switch', { name: 'Auto-scroll logs' }));
  await page.keyboard.press('Space');
  await audit(page, '[role=dialog]');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});
