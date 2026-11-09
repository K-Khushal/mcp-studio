import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { studioURL, studioToken } from './ports';
import { fixtureInfo } from './helpers';

const post = async (page: Page, path: string, body: unknown) =>
  (await (await page.request.post(`${studioURL}${path}`, { data: body, headers: { Authorization: `Bearer ${studioToken}` } })).json()) as { id: string };

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Presses Tab until `target` has focus; fails if it is never reached. */
async function tabTo(page: Page, target: ReturnType<Page['locator']>, limit = 200) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab never reached ${target}`);
}

test('first run: main pane leads with New collection and Import, with no axe violations', async ({ page }) => {
  await page.route('**/api/collections', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'MCP Studio' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'New collection' })).toBeVisible();
  await expect(main.getByRole('button', { name: /Import claude_desktop_config\.json/ })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  // Keyboard: the primary action is reachable and opens the name field.
  await tabTo(page, main.getByRole('button', { name: 'New collection' }));
  await page.keyboard.press('Enter');
  await expect(main.getByRole('textbox', { name: 'Collection name' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(main.getByRole('button', { name: 'New collection' })).toBeVisible();
});

test('sidebar, top bar and status bar work by keyboard alone and pass axe', async ({ page }) => {
  const info = await fixtureInfo(page);
  const stdio = { transport: 'stdio', config: { command: info.command, args: [info.fixture], env: {}, inheritSystemEnv: true } };
  const longName = 'customer-support-knowledge-base-production-readonly';
  const col = await post(page, '/collections', { name: 'Shell Keyboard' });
  await post(page, `/collections/${col.id}/connections`, { name: 'Shell Fixture', connectionConfig: stdio });
  await post(page, `/collections/${col.id}/connections`, { name: longName, connectionConfig: stdio });
  await post(page, '/collections', { name: 'Shell Empty' });
  await page.goto('/');

  // Landmarks and heading
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Collections' })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'MCP Studio' })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  // Long names stay readable through title
  await expect(page.getByRole('button', { name: longName, exact: true })).toHaveAttribute('title', longName);

  // Tab to a Connection row, Enter selects it
  const row = page.getByRole('button', { name: 'Shell Fixture', exact: true });
  await tabTo(page, row);
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-current', 'true');
  expect(await violations(page)).toEqual([]);

  // Its row actions appear on focus (visible, not opacity 0) and are at least 24px
  await page.keyboard.press('Tab');
  const connectAction = page.getByRole('button', { name: 'Connect Shell Fixture', exact: true });
  await expect(connectAction).toBeFocused();
  expect(await connectAction.evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe('1');
  const box = (await connectAction.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);

  // Enter connects; status reads the shared vocabulary in the top and status bars
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('banner').getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText(/^MCP Studio v/).locator('..')).toContainText('Connected');
  await expect(page.getByRole('button', { name: 'Connect Shell Fixture' })).toHaveCount(0);
  expect(await violations(page)).toEqual([]);

  // Collapse and expand by keyboard
  const collapse = page.getByRole('button', { name: 'Collapse Shell Keyboard', exact: true });
  await collapse.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Expand Shell Keyboard' })).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(row).toBeVisible();

  // An empty Collection shows an always-visible Add Connection row
  await expect(page.getByRole('button', { name: 'Add Connection', exact: true }).last()).toBeVisible();

  // Search narrows Connections; an empty result explains itself and Clear restores
  const search = page.getByRole('textbox', { name: 'Search Collections and Connections' });
  await search.fill('zzz-nothing');
  await expect(page.getByText('No Connections match "zzz-nothing"')).toBeVisible();
  await expect(page.getByText(/No collections yet/)).toHaveCount(0);
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(row).toBeVisible();
  await search.fill('support');
  await expect(page.getByRole('button', { name: longName, exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('at 200% zoom the sidebar opens from a labelled top-bar trigger', async ({ page }) => {
  await page.setViewportSize({ width: 683, height: 384 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Collections', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('navigation', { name: 'Collections' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('search reveals matches but respects each Collection collapse until the query changes', async ({ page }) => {
  const info = await fixtureInfo(page);
  const connectionConfig = { transport: 'stdio', config: { command: info.command, args: [info.fixture], env: {}, inheritSystemEnv: true } };
  for (const name of ['Search Alpha', 'Search Beta']) {
    const col = await post(page, '/collections', { name });
    await post(page, `/collections/${col.id}/connections`, { name: `${name} match`, connectionConfig });
  }
  await page.goto('/');
  const search = page.getByRole('textbox', { name: 'Search Collections and Connections' });
  const alpha = page.getByRole('button', { name: 'Search Alpha match', exact: true });
  const beta = page.getByRole('button', { name: 'Search Beta match', exact: true });
  await page.getByRole('button', { name: 'Collapse Search Alpha', exact: true }).click();
  await search.fill('match');
  await expect(alpha).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Search Alpha', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand Search Alpha', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(alpha).toHaveCount(0);
  await expect(beta).toBeVisible();
  await search.fill('mat');
  await expect(alpha).toBeVisible();
  const collapse = page.getByRole('button', { name: 'Collapse Search Alpha', exact: true });
  await collapse.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Expand Search Alpha', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(alpha).toHaveCount(0);
  await search.fill('');
  await expect(alpha).toHaveCount(0);
  await search.fill('mat');
  await expect(alpha).toBeVisible();
});
