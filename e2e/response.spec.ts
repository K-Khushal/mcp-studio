import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fixtureConnection, selectTool, runTool, jsonArgs, createConnection, fixtureInfo, connect } from './helpers';

test.setTimeout(180_000);

const shots = process.env.RESPONSE_AUDIT_DIR ?? 'test-results/response-audit';
const before = process.env.RESPONSE_AUDIT_BEFORE === '1';
const surface = '[data-testid="response"]';

async function responseTab(page: Page, name: string) {
  await page.locator(surface).getByRole(before ? 'button' : 'tab', { name: before ? name.toLowerCase() : name, exact: true }).click();
}

for (const theme of ['dark', 'light'] as const) {
  test(`response accessibility and screenshots: ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(theme => localStorage.setItem('mcp-studio-config', JSON.stringify({ theme })), theme);
    await fixtureConnection(page, `Response ${theme}`);
    // Keep the response visible in the default desktop split.
    if (await page.getByRole('group', { name: 'Filter by source' }).isVisible()) {
      await page.getByRole('button', { name: /^Console/ }).click();
    }
    const counts: Record<string, unknown> = {};
    await mkdir(shots, { recursive: true });
    async function audit(state: string, screenshot = false) {
      const result = await new AxeBuilder({ page }).include(surface).analyze();
      counts[state] = result.violations.map(v => ({ id: v.id, nodes: v.nodes.length }));
      if (screenshot) await page.screenshot({ path: `${shots}/95-${before ? 'before' : 'after'}-${theme}-${state}.png` });
      await writeFile(`${shots}/95-${before ? 'before' : 'after'}-${theme}-axe.json`, JSON.stringify(counts, null, 2));
      if (!before) expect(result.violations, state).toEqual([]);
    }
    await audit('empty');
    await selectTool(page, 'Structured answer');
    await runTool(page);
    await expect(page.getByRole('region', { name: 'Structured content' })).toContainText('42');
    await audit('pretty', true);
    await responseTab(page, 'Raw');
    await audit('raw');
    await responseTab(page, 'Timeline');
    await audit('timeline', true);
    await responseTab(page, 'Pretty');
    await selectTool(page, 'error');
    await runTool(page);
    await expect(page.getByText('Tool execution error')).toBeVisible();
    await audit('error');
    await selectTool(page, 'slow');
    await jsonArgs(page, { steps: 100 });
    await page.getByRole('button', { name: 'Run Tool', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Call progress' })).toBeVisible();
    await audit('running');
    // Start a fresh Call for cancellation: the audit can outlast the five-second fixture.
    await expect(page.getByRole('button', { name: 'Run Tool', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Run Tool', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Call progress' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel Call' }).press('Enter');
    await expect(page.getByText('Call cancelled.', { exact: true })).toBeVisible();
    await audit('cancelled');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await createConnection(page, `Response HTTP ${theme}`, `Response HTTP ${theme} Collection`);
    const info = await fixtureInfo(page);
    await page.getByRole('radio', { name: 'HTTP', exact: true }).click();
    await page.getByLabel('Server URL').fill(info.streamable);
    await connect(page);
    await selectTool(page, 'echo');
    await jsonArgs(page, { text: 'HTTP response' });
    await runTool(page);
    await responseTab(page, 'Headers');
    await audit('headers', true);
    await writeFile(`${shots}/95-${before ? 'before' : 'after'}-${theme}-axe.json`, JSON.stringify(counts, null, 2));
  });
}

test('response keyboard walkthrough: tabs, JSON expansion and copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fixtureConnection(page, 'Keyboard response');
  await selectTool(page, 'Structured answer');
  await runTool(page);
  const panel = page.locator(surface);
  await expect(panel.getByRole('tab', { name: 'Headers', exact: true })).toHaveCount(0);
  // Enter the response through normal Tab navigation; no mouse or focus() inside the surface.
  for (let i = 0; i < 80 && !await panel.getByRole('button', { name: 'Copy response' }).evaluate(el => el === document.activeElement); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(panel.getByRole('button', { name: 'Copy response' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('42');
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('tab', { name: 'Pretty' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('tabpanel', { name: 'Raw' })).toContainText('structuredContent');
  await page.keyboard.press('End');
  await expect(panel.getByRole('tabpanel', { name: 'Timeline' })).toContainText('Call');
  await page.keyboard.press('Home');
  await expect(panel.getByRole('tab', { name: 'Pretty' })).toHaveAttribute('aria-selected', 'true');
  const toggle = panel.getByRole('button', { name: '1 key', exact: true });
  for (let i = 0; i < 8 && !await toggle.evaluate(el => el === document.activeElement); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  const copy = panel.getByRole('button', { name: 'Copy value' });
  await expect(copy).toBeFocused();
  await expect(copy).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('42');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await createConnection(page, 'Keyboard HTTP response', 'Keyboard HTTP Collection');
  const info = await fixtureInfo(page);
  await page.getByRole('radio', { name: 'HTTP', exact: true }).click();
  await page.getByLabel('Server URL').fill(info.streamable);
  await connect(page);
  await selectTool(page, 'echo');
  await runTool(page);
  for (let i = 0; i < 80 && !await panel.getByRole('tab', { name: 'Pretty' }).evaluate(el => el === document.activeElement); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(panel.getByRole('tab', { name: 'Pretty' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('tab', { name: 'Headers' })).toBeFocused();
  await expect(panel.getByRole('tabpanel', { name: 'Headers' })).toContainText('Response Headers');
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('tabpanel', { name: 'Timeline' })).toBeVisible();
});
