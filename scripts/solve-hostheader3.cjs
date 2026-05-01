const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function solveHostHeader3() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
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
    
    const labLink = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      const topicLinks = links.filter(el => {
        const a = el.querySelector('a');
        return a?.getAttribute('href')?.includes('/web-security/host-header/');
      });
      const target = topicLinks[2]; // lab 3
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    });
    
    if (labLink === 'SOLVED') {
      console.log('Already solved');
      await browser.close();
      return true;
    }
    
    // Launch lab
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const base = new URL(page.url()).origin;
    console.log('Lab URL:', base);
    
    // Run fixed solver
    const solverPath = '/tmp/wsa-solutions/HostHeader/exploit-lab03.py';
    try {
      const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
        timeout: 300000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(output);
    } catch (e) {
      console.log('Output:', e.stdout);
      console.log('Stderr:', e.stderr);
    }
    
    // Verify
    await page.waitForTimeout(3000);
    const verifyPage = await ctx.newPage();
    await verifyPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await verifyPage.textContent('body').catch(() => '');
    const solved = body?.toLowerCase().includes('congratulations');
    console.log('Solved:', solved);
    
    await browser.close();
    return solved;
  } catch (e) {
    console.error('Error:', e.message);
    await browser.close();
    return false;
  }
}

solveHostHeader3().then(solved => {
  console.log(solved ? '🎯 SOLVED!' : '⬜ Not solved');
  process.exit(solved ? 0 : 1);
}).catch(console.error);
