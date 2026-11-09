import { fixtureURL } from './ports';
import { expect, type Page } from '@playwright/test';

export async function createConnection(page: Page, name: string, collection = name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New collection', exact: true }).first().click();
  await page.getByPlaceholder('Collection name', { exact: true }).fill(collection);
  await page.getByPlaceholder('Collection name', { exact: true }).press('Enter');
  await expect(page.getByText(collection, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Connection', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Connection name').fill(name);
  await dialog.getByPlaceholder('Connection name').press('Enter');
  await page.getByText(name, { exact: true }).last().click();
  await expect(page.getByLabel('Command', { exact: true })).toBeVisible();
}

export async function configureStdio(page: Page, command: string, args: string[]) {
  await page.getByRole('radio', { name: 'STDIO', exact: true }).click();
  await page.getByLabel('Command', { exact: true }).fill(command);
  const settings = page.getByRole('button', { name: /^STDIO settings:/ });
  if (await settings.getAttribute('aria-expanded') === 'false') await settings.click();
  for (const [index, arg] of args.entries()) {
    await page.getByRole('button', { name: 'Add argument', exact: true }).click();
    await page.getByLabel(`Argument ${index + 1}`, { exact: true }).fill(arg);
  }
}

export async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible({ timeout: 90_000 });
}

export async function selectTool(page: Page, name: string, title = name) {
  await page.getByPlaceholder('Filter tools...').fill(name);
  await page.getByRole('button').filter({ has: page.getByText(title, { exact: true }) }).click();
}

export async function jsonArgs(page: Page, args: Record<string, unknown>) {
  await page.getByRole('group', { name: 'Arguments editor mode' }).getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByLabel('Arguments JSON').fill(JSON.stringify(args));
}

export async function runTool(page: Page) {
  await page.getByRole('button', { name: 'Run Tool', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Tool', exact: true })).toBeEnabled();
}

export async function fixtureInfo(page: Page): Promise<{ command: string; fixture: string; streamable: string; sse: string; directory: string }> {
  return (await page.request.get(`${fixtureURL}/info`)).json();
}

export async function fixtureConnection(page: Page, name: string) {
  await createConnection(page, name, `${name} Collection`);
  const info = await fixtureInfo(page);
  await configureStdio(page, info.command, [info.fixture]);
  await connect(page);
}
