const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  await page.waitForTimeout(2000);

  const topics = ['sql-injection', 'cross-site-scripting', 'ssrf', 'os-command-injection'];
  
  for (const topic of topics) {
    await page.goto(`https://portswigger.net/web-security/${topic}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const links = await page.locator('.widgetcontainer-lab-link').all();
    console.log(`\n=== ${topic} ===`);
    console.log(`Total lab links found: ${links.length}`);
    
    let count = 0;
    for (const link of links) {
      count++;
      const cls = await link.getAttribute('class');
      const a = await link.locator('a').first();
      const title = await a.textContent();
      const isSolved = cls && cls.includes('is-solved');
      console.log(`  #${count}: ${isSolved ? '[SOLVED]' : '[UNSOLVED]'} ${title?.trim()}`);
    }
  }

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
