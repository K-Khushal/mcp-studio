import { fixtureURL, studioToken, studioURL } from './ports';
import { test, expect } from '@playwright/test';
import { fixtureConnection, selectTool, runTool, jsonArgs, createConnection, configureStdio, connect, fixtureInfo } from './helpers';

test('STDIO: form and JSON Calls, prompts and structured output', async ({ page }) => {
  await fixtureConnection(page, 'Fixture Calls');
  await selectTool(page, 'echo');
  await page.getByLabel('text', { exact: true }).fill('from form');
  await runTool(page);
  await expect(page.getByText('from form', { exact: true }).last()).toBeVisible();
  await jsonArgs(page, { text: 'from JSON' });
  await page.getByLabel('Arguments JSON').fill('{');
  await expect(page.getByRole('button', { name: 'Run Tool', exact: true })).toBeDisabled();
  await page.getByLabel('Arguments JSON').fill('{"text":"from JSON"}');
  await runTool(page);
  await expect(page.getByText('from JSON', { exact: true }).last()).toBeVisible();
  await selectTool(page, 'Structured answer');
  await runTool(page);
  await expect(page.getByRole('status').filter({ hasText: 'Matches output schema' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Structured content' })).toContainText('42');
  await page.getByRole('tab', { name: /^Prompts/ }).click();
  await page.getByRole('button', { name: 'greet', exact: true }).click();
  await page.getByPlaceholder('name', { exact: true }).fill('Ada');
  await page.getByRole('button', { name: 'Run Prompt', exact: true }).click();
  await expect(page.getByText('Hello, Ada!', { exact: true })).toBeVisible();
});

for (const variant of ['streamable', 'sse'] as const) {
  test(`HTTP ${variant}: discovers tools and executes a Call`, async ({ page }) => {
    await createConnection(page, `HTTP ${variant}`, `${variant} Collection`);
    const info = await fixtureInfo(page);
    await page.getByRole('radio', { name: 'HTTP', exact: true }).click();
    await page.getByLabel('Server URL').fill(info[variant]);
    await connect(page);
    await expect(page.getByRole('banner').getByText(variant === 'sse' ? /HTTP · SSE/ : /HTTP · Streamable/)).toBeVisible();
    await selectTool(page, 'echo');
    await jsonArgs(page, { text: `via ${variant}` });
    await runTool(page);
    await expect(page.getByText(`via ${variant}`, { exact: true }).last()).toBeVisible();
  });
}

test('progress, Cancel and timeout end Calls visibly', async ({ page }) => {
  await fixtureConnection(page, 'Slow Calls');
  await selectTool(page, 'slow');
  await jsonArgs(page, { steps: 100 });
  await page.getByRole('button', { name: 'Run Tool', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Call progress' })).toBeVisible();
  await expect(page.getByRole('timer')).toContainText('elapsed');
  await page.getByRole('button', { name: 'Cancel Call' }).click();
  await expect(page.getByText(/Call cancelled/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Call timeout in seconds').fill('1');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Run Tool', exact: true }).click();
  await expect(page.getByText('Call timed out after 1 seconds', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel Call' })).toHaveCount(0);
});

test('elicitation accepts, declines and cancels the MCP Server form', async ({ page }) => {
  await fixtureConnection(page, 'Elicitation');
  await selectTool(page, 'elicit');
  for (const action of ['Accept', 'Decline', 'Cancel']) {
    await page.getByRole('button', { name: 'Run Tool', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'MCP Server needs your input' });
    await expect(form).toContainText('Your name?');
    if (action === 'Accept') await form.getByLabel('name', { exact: true }).fill('Ada');
    await form.getByRole('button', { name: action, exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText(new RegExp(`"action":"${action.toLowerCase()}"`)).last()).toBeVisible();
  }
});

test('verbose protocol logs and source, level and search filters', async ({ page }) => {
  await fixtureConnection(page, 'Logging');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Verbose logging' }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await selectTool(page, 'log');
  await runTool(page);
  // Console starts expanded; open it if a persisted preference closed it.
  if (!await page.getByRole('group', { name: 'Filter by source' }).isVisible()) await page.getByRole('button', { name: /^Console/ }).click();
  await page.getByRole('group', { name: 'Filter by source' }).getByRole('button', { name: 'Server', exact: true }).click();
  await page.getByRole('group', { name: 'Filter by level' }).getByRole('button', { name: 'INFO', exact: true }).click();
  await expect(page.getByText(/Fixture log/).last()).toBeVisible();
  await page.getByLabel('Search logs').fill('not-a-real-log');
  await expect(page.getByText(/Fixture log/)).toHaveCount(0);
  await page.getByLabel('Search logs').fill('');
  await page.getByRole('group', { name: 'Filter by level' }).getByRole('button', { name: 'INFO', exact: true }).click();
  await page.getByRole('group', { name: 'Filter by source' }).getByRole('button', { name: 'Protocol', exact: true }).click();
  await expect(page.getByRole('button', { name: /tools\/call/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /tools\/call/ }).first().click();
  await expect(page.getByText('"name": "log"', { exact: false }).last()).toBeVisible();
});

test('Environment Variables resolve and missing Variables block Calls and connect', async ({ page }) => {
  await fixtureConnection(page, 'Variables');
  await page.getByTitle('Active Environment', { exact: true }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByPlaceholder('Environment name').fill('E2E Environment');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'E2E Environment', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Active Environment' })).toContainText('E2E Environment');
  await page.getByPlaceholder('KEY', { exact: true }).fill('GREETING');
  await page.getByPlaceholder('VALUE', { exact: true }).fill('resolved greeting');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await selectTool(page, 'echo');
  await jsonArgs(page, { text: '{{GREETING}}' });
  await runTool(page);
  await expect(page.getByText('resolved greeting', { exact: true })).toBeVisible();
  await page.getByLabel('Arguments JSON').fill('{"text":"{{MISSING_CALL}}"}');
  await runTool(page);
  await expect(page.getByText(/Unresolved.*MISSING_CALL/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByLabel('Command', { exact: true }).fill('{{MISSING_COMMAND}}');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'MISSING_COMMAND' }).first()).toBeVisible();
});

test('config import, theme and saved entities survive a packaged CLI restart', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import Connections', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const info = await fixtureInfo(page);
  await dialog.getByLabel('Configuration JSON').fill(JSON.stringify({ mcpServers: {
    'Imported fixture': { command: info.command, args: [info.fixture] },
    'Imported HTTP': { url: info.streamable },
  } }));
  await dialog.getByLabel('Target Collection').selectOption('');
  await dialog.getByLabel('New Collection name').fill('Imported Collection');
  await dialog.getByRole('button', { name: 'Import 2 Connections', exact: true }).click();
  await expect(dialog.getByText('Imported', { exact: true })).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByText('Imported fixture', { exact: true }).click();
  await page.getByTitle('Active Environment', { exact: true }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByPlaceholder('Environment name').fill('Restart Environment');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Restart Environment', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Active Environment' })).toContainText('Restart Environment');
  await page.getByPlaceholder('KEY', { exact: true }).fill('PERSISTED');
  await page.getByPlaceholder('VALUE', { exact: true }).fill('saved variable');
  const savedVariable = page.waitForResponse(response => response.url().includes('/environments/')
    && response.request().method() === 'PATCH'
    && response.request().postDataJSON()?.variables?.PERSISTED === 'saved variable');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await savedVariable;
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  expect((await request.post(`${fixtureURL}/restart`)).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText('Imported Collection', { exact: true })).toBeVisible();
  await expect(page.getByText('Imported HTTP', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Theme: Light/ })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  await page.getByText('Imported fixture', { exact: true }).click();
  await connect(page);
  await selectTool(page, 'echo');
  await jsonArgs(page, { text: 'after restart' });
  await runTool(page);
  await expect(page.getByText('after restart', { exact: true }).last()).toBeVisible();
  await page.getByTitle('Active Environment', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Environment Variables' })).toContainText('Restart Environment');
  await expect(page.getByRole('dialog')).toContainText('PERSISTED');
  await expect(page.getByRole('dialog').getByLabel('PERSISTED value')).toHaveValue('saved variable');
});

test('Connection failure is visible; Connections and Collections can be renamed and deleted', async ({ page }) => {
  await createConnection(page, 'Bad Connection', 'Disposable Collection');
  await page.getByLabel('Command', { exact: true }).fill('mcp-studio-command-that-does-not-exist');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Connection failed:' })).toBeVisible();
  await page.getByText('Bad Connection', { exact: true }).last().dblclick();
  // The rename field has no accessible label; it is the focused native textbox.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Renamed Connection');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Renamed Connection', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete Connection', exact: true }).last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Renamed Connection', { exact: true })).toHaveCount(0);
  await page.getByText('Disposable Collection', { exact: true }).dblclick();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Renamed Collection');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Renamed Collection', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Renamed Collection', { exact: true })).toHaveCount(0);
});

test('public everything STDIO package returns tools and image content', async ({ page }, testInfo) => {
  await createConnection(page, 'Everything', 'Everything Collection');
  await configureStdio(page, 'npx', ['-y', '@modelcontextprotocol/server-everything@2.2.1']);
  await connect(page);
  await selectTool(page, 'Echo Tool');
  await jsonArgs(page, { message: 'Everything echo' });
  await runTool(page);
  await expect(page.getByText(/Everything echo/).last()).toBeVisible();
  await selectTool(page, 'Get Tiny Image Tool');
  await runTool(page);
  await expect(page.getByRole('img', { name: /^Image response/ })).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: /^Image response/ }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('everything-image.png') });
});

test('launch token: printed link, reload, tokenless tab and CSP', async ({ browser }) => {
  // A fresh context has no origin credential, like a browser that never opened the printed link.
  const context = await browser.newContext({ baseURL: studioURL, viewport: { width: 1440, height: 1000 }, storageState: { cookies: [], origins: [] } });
  try {
    const violations: string[] = [];
    context.on('console', message => { if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text()); });
    const stranger = await context.newPage();
    const denied = await stranger.goto('/');
    expect(denied?.status()).toBe(200);
    await expect(stranger.getByRole('heading', { name: 'Open MCP Studio from your terminal' })).toBeVisible();
    const cookieName = `mcp_studio_${new URL(studioURL).port}`;
    expect((await context.cookies()).some(cookie => cookie.name === cookieName)).toBe(false);

    await context.addCookies([{ name: cookieName, value: studioToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage();
    const opened = await page.goto(`/?token=${studioToken}`);
    expect(opened?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    await expect(page).toHaveURL(`${studioURL}/`);
    await expect(page.getByRole('button', { name: 'New collection', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.cookie)).not.toContain(studioToken);
    expect(await page.evaluate(() => localStorage.getItem('mcp-studio.launch-token'))).toBe(studioToken);
    expect((await context.cookies()).some(cookie => cookie.name === cookieName)).toBe(false);
    const foreignApp = await context.newPage();
    await foreignApp.goto(`${fixtureURL}/info`);
    expect(await foreignApp.evaluate(() => localStorage.getItem('mcp-studio.launch-token'))).toBeNull();
    expect(await foreignApp.evaluate(() => document.cookie)).not.toContain(studioToken);
    // Reading another window's storage also hits the browser's same-origin boundary.
    const popupReady = context.waitForEvent('page');
    const foreignWindow = await foreignApp.evaluateHandle(url => window.open(url), `${studioURL}/`);
    await (await popupReady).waitForLoadState();
    expect(await foreignApp.evaluate(win => {
      try { return win!.localStorage.getItem('mcp-studio.launch-token'); } catch { return 'blocked'; }
    }, foreignWindow)).toBe('blocked');
    expect((await context.request.get(`${studioURL}/collections`, { headers: { Cookie: `${cookieName}=${studioToken}` } })).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole('button', { name: 'New collection', exact: true })).toBeVisible();
    const sameBrowserTab = await context.newPage();
    await sameBrowserTab.goto('/');
    await expect(sameBrowserTab.getByRole('button', { name: 'New collection', exact: true })).toBeVisible();

    await stranger.reload();
    await expect(stranger.getByRole('button', { name: 'New collection', exact: true })).toBeVisible();
    await fixtureConnection(page, 'CSP Fixture');
    await selectTool(page, 'Structured answer');
    await runTool(page);
    await expect(page.getByRole('status').filter({ hasText: 'Matches output schema' })).toBeVisible();
    expect(violations).toEqual([]);
  } finally {
    await context.close();
  }
});


test('rotated Launch token locks an open tab and the new printed link restores access', async ({ page, request }) => {
  await fixtureConnection(page, 'Rotated token');
  const rotated = `${studioToken}-rotated`;
  try {
    expect((await request.post(`${fixtureURL}/restart?token=${rotated}`)).ok()).toBeTruthy();
    // The old socket closes during restart. Reconnecting must recheck its credential.
    // The help page may already be visible if the close-triggered check reached the new launch.
    const help = page.getByRole('heading', { name: 'Open MCP Studio from your terminal' });
    if (!await help.isVisible()) await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(help).toBeVisible();
    await expect(page.getByRole('button', { name: 'New collection', exact: true })).toHaveCount(0);
    await page.goto(`/?token=${rotated}`);
    await expect(page).toHaveURL(`${studioURL}/`);
    await expect(page.getByRole('button', { name: 'New collection', exact: true })).toBeVisible();
  } finally {
    expect((await request.post(`${fixtureURL}/restart`)).ok()).toBeTruthy();
  }
});
