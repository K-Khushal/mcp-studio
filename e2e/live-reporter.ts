import { mkdir, writeFile } from 'node:fs/promises';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class LiveReporter implements Reporter {
  private rows: string[] = [];
  onTestEnd(_test: TestCase, result: TestResult) {
    for (const attachment of result.attachments) {
      if (attachment.name !== 'live-result' || !attachment.body) continue;
      const row = JSON.parse(attachment.body.toString());
      const clean = (value: unknown) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
      this.rows.push(`| ${[row.server, row.transport, row.tools, row.call, row.result + (row.reason ? ': ' + row.reason : '')].map(clean).join(' | ')} |`);
    }
  }
  async onEnd() {
    if (!this.rows.length) return;
    const table = ['| Server | Transport | Tools | Call | Result |', '| --- | --- | ---: | --- | --- |', ...this.rows, ''].join('\n');
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/live-results.md', table);
    console.log(table);
  }
}
