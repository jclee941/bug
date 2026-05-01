const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    console.log('\n[essential-skills#2] Scanning non-standard data structures\n');
    
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
        return a?.getAttribute('href')?.includes('/web-security/essential-skills/');
      });
      const target = topicLinks[1]; // lab #2
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    });
    
    if (labLink === 'SOLVED') {
      console.log('Already solved');
      await browser.close();
      return;
    }
    
    // Launch lab
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) { console.log('No launch link'); await browser.close(); return; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const labUrl = page.url();
    if (!labUrl.includes('web-security-academy.net')) {
      console.log('Lab did not load');
      await browser.close();
      return;
    }
    
    const base = new URL(labUrl).origin;
    console.log(`Lab URL: ${base}`);
    
    // Navigate to lab and inspect
    await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Look for non-standard data structures - usually XML or custom formats
    const html = await page.content();
    
    // Try common endpoints that might have non-standard data
    const endpoints = [
      '/api/products',
      '/api/users',
      '/api/keys',
      '/api/config',
      '/api/data',
      '/products',
      '/users',
      '/admin',
    ];
    
    for (const endpoint of endpoints) {
      console.log(`Trying ${endpoint}...`);
      const response = await page.goto(`${base}${endpoint}`, { waitUntil: 'networkidle', timeout: 15000 });
      if (response) {
        const contentType = response.headers()['content-type'] || '';
        const text = await response.text();
        console.log(`  Status: ${response.status()}, Content-Type: ${contentType}`);
        console.log(`  Length: ${text.length}`);
        if (text.length < 500) {
          console.log(`  Body: ${text.substring(0, 200)}`);
        }
        
        // Check for XML or non-JSON data structures
        if (text.includes('<?xml') || text.includes('<!DOCTYPE') || (text.includes('<') && text.includes('>') && !text.includes('<!DOCTYPE html>'))) {
          console.log('  Found XML/non-standard data!');
        }
      }
      await page.waitForTimeout(1000);
    }
    
    // Check if solved
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await page.textContent('body').catch(() => '');
    if (body.toLowerCase().includes('congratulations')) {
      console.log('SOLVED!');
    } else {
      console.log('Not solved');
    }
    
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
