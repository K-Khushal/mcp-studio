import { mkdirSync, writeFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { fixtureConnection, selectTool } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });

// Axe counts are scoped to this surface (tools/prompts panel, elicitation dialog).
// AXE_LABEL=before records counts on a baseline build without asserting; SHOTS_DIR saves screenshots.
const label = process.env.AXE_LABEL;
const shotsDir = process.env.SHOTS_DIR;
const counts: Record<string, { violations: number; nodes: number; rules: string[] }> = {};

async function axe(page: Page, state: string, theme: string, scope: 'panel' | 'dialog') {
  if (scope === 'panel') {
    // The panel root is the closest min-h-0 flex container around the list's filter input.
    await page.evaluate(() => {
      document.querySelector('[data-axe-scope]')?.removeAttribute('data-axe-scope');
      document.querySelector('input[placeholder^="Filter "]')?.closest('.min-h-0')?.setAttribute('data-axe-scope', '');
    });
  }
  const scopeSelector = scope === 'panel' ? '[data-axe-scope]' : '[role="dialog"]';
  expect(await page.locator(scopeSelector).count(), `axe scope for ${state}`).toBe(1);
  const builder = new AxeBuilder({ page }).include(scopeSelector);
  const { violations } = await builder.analyze();
  const nodes = violations.reduce((n, v) => n + v.nodes.length, 0);
  const rules = violations.map((v) => `${v.id}×${v.nodes.length}`);
  // Informational: the whole page, which includes shell/connection/response areas owned by other tickets.
  const page_ = (await new AxeBuilder({ page }).analyze()).violations;
  counts[`${state} ${theme}`] = { violations: violations.length, nodes, rules, pageViolations: page_.length, pageNodes: page_.reduce((n, v) => n + v.nodes.length, 0) } as never;
  console.log(`AXE ${label ?? 'after'} | ${state} | ${theme} | violations=${violations.length} nodes=${nodes} ${rules.join(',')} | whole-page violations=${page_.length} nodes=${page_.reduce((n, v) => n + v.nodes.length, 0)}`);
  if (!label) expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`), `${state} (${theme})`).toEqual([]);
}

async function shot(page: Page, name: string, theme: string) {
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/94-${label ?? 'after'}-${name}-${theme}.png` });
}

for (const width of [1366, 1024]) {
for (const theme of ['dark', 'light'] as const) {
  test(`axe and screenshots: tools, prompts, elicitation (${theme}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.addInitScript((t) => localStorage.setItem('mcp-studio-config', JSON.stringify({ theme: t })), theme);
    await fixtureConnection(page, `Axe ${theme} ${width}`);

    await selectTool(page, 'echo');
    await page.getByPlaceholder('Filter tools...').fill('');
    await expect(page.getByRole('textbox', { name: 'text', exact: true })).toBeVisible();
    await axe(page, 'tool list and form', theme, 'panel');
    await shot(page, 'tool-form', theme);

    await page.getByPlaceholder('Filter tools...').fill('');
    await selectTool(page, 'form-controls');
    const add = page.getByRole('button', { name: 'Add item to labels' });
    await expect(add).toBeVisible();
    await page.getByRole('textbox', { name: 'payload', exact: true }).press('Control+Enter');
    await expect(add).toBeFocused();
    await axe(page, `composite required errors ${width}`, theme, 'panel');
    await add.click();
    await page.getByRole('textbox', { name: 'labels item 1' }).fill('sample');
    await axe(page, `array items ${width}`, theme, 'panel');

    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = page.getByRole('textbox', { name: 'Arguments JSON' });
    await json.press('Meta+Enter');
    await expect(json).toBeFocused();
    await expect(json).toHaveAttribute('aria-invalid', 'true');
    await expect(json).toHaveAccessibleDescription('Required: options, payload');
    await axe(page, `JSON required errors ${width}`, theme, 'panel');

    await selectTool(page, 'structured', 'Structured answer');
    await axe(page, 'annotated tool', theme, 'panel');
    await shot(page, 'tool-annotated', theme);

    await page.getByRole('tab', { name: 'Prompts', exact: true }).click();
    await page.getByRole('button', { name: /^greet/ }).click();
    await axe(page, 'prompt arguments', theme, 'panel');
    await shot(page, 'prompt-args', theme);
    await page.getByRole('textbox', { name: 'name', exact: true }).press('Control+Enter');
    await axe(page, 'prompt required error', theme, 'panel');
    await shot(page, 'prompt-required', theme);

    await page.getByRole('tab', { name: 'Tools', exact: true }).click();
    await page.getByPlaceholder('Filter tools...').fill('elicit');
    await page.getByRole('button', { name: /^elicit/ }).click();
    await page.getByRole('button', { name: 'Run Tool' }).click();
    const dialog = page.getByRole('dialog', { name: 'MCP Server needs your input' });
    await expect(dialog.getByRole('textbox', { name: 'name' })).toBeVisible();
    if (!label) await expect(dialog.getByRole('textbox', { name: 'name' })).toBeFocused();
    await axe(page, 'elicitation dialog', theme, 'dialog');
    await shot(page, 'elicitation', theme);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
}

}

test.afterAll(() => {
  if (!label) return;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/axe-94-${label}.json`, JSON.stringify(counts, null, 2));
});

// Keyboard-only: after connecting, no pointer is used on the surface.
async function tabTo(page: Page, matches: (el: Element | null) => boolean, key = 'Tab') {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(`(${matches.toString()})(document.activeElement)`)) return;
    await page.keyboard.press(key);
  }
  throw new Error(`focus never reached target with ${key}: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`);
}

test('keyboard-only: pick a tool, run it, keep args across tabs, answer an elicitation', async ({ page }) => {
  await fixtureConnection(page, 'Keyboard');
  await page.getByPlaceholder('Filter tools...').focus();
  await page.keyboard.type('echo');

  await tabTo(page, (el) => el?.textContent?.startsWith('echo') === true && el.tagName === 'BUTTON');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^echo/ })).toHaveAttribute('aria-current', 'true');

  await tabTo(page, (el) => el?.getAttribute('aria-label') === 'text');
  await page.keyboard.type('typed by keyboard');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText('typed by keyboard', { exact: true }).last()).toBeVisible();

  // Prompts tab, then back: the Tool's typed arguments survive.
  await tabTo(page, (el) => el?.getAttribute('role') === 'tab' && el.textContent?.trim() === 'Tools', 'Shift+Tab');
  await page.keyboard.press('ArrowRight');
  await tabTo(page, (el) => el?.tagName === 'BUTTON' && el.textContent?.startsWith('greet') === true);
  await page.keyboard.press('Enter');
  await tabTo(page, (el) => el?.tagName === 'INPUT' && el.getAttribute('aria-required') === 'true');
  await page.keyboard.press('Control+Enter');
  const name = page.getByRole('textbox', { name: 'name', exact: true });
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();
  await expect(page.getByRole('button', { name: 'Run Prompt' })).toBeDisabled();
  await page.keyboard.type('Ada');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText('Hello, Ada!', { exact: true })).toBeVisible();

  await tabTo(page, (el) => el?.getAttribute('role') === 'tab' && el.textContent?.trim() === 'Prompts', 'Shift+Tab');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('textbox', { name: 'text', exact: true })).toHaveValue('typed by keyboard');

  // Elicitation: opens on the first field, Accept by keyboard.
  await page.getByPlaceholder('Filter tools...').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('elicit');
  await tabTo(page, (el) => el?.tagName === 'BUTTON' && el.textContent?.startsWith('elicit') === true);
  await page.keyboard.press('Enter');
  await tabTo(page, (el) => el?.getAttribute('aria-label') === 'text');
  await page.keyboard.press('Control+Enter');
  const dialog = page.getByRole('dialog', { name: 'MCP Server needs your input' });
  await expect(dialog.getByRole('textbox', { name: 'name' })).toBeFocused();
  await page.keyboard.type('Grace');
  await tabTo(page, (el) => el?.textContent?.trim() === 'Accept');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/"action":"accept"/).last()).toBeVisible();
});

test('blocked shortcuts focus malformed fallback JSON with all required arguments present', async ({ page }) => {
  await fixtureConnection(page, 'Invalid fallback');
  await selectTool(page, 'form-controls');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByRole('textbox', { name: 'Arguments JSON' }).fill(JSON.stringify({
    labels: ['sample'], options: { city: 'Paris' }, payload: 'valid',
  }));
  await page.getByRole('button', { name: 'Form', exact: true }).click();
  const payload = page.getByRole('textbox', { name: 'payload', exact: true });
  const city = page.getByRole('textbox', { name: 'city', exact: true });
  await payload.fill('{');
  await expect(payload).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Run Tool' })).toBeDisabled();
  for (const shortcut of ['Control+Enter', 'Meta+Enter']) {
    await city.press(shortcut);
    await expect(payload).toBeFocused();
  }
});
