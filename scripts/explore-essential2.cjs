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

  await page.goto('https://portswigger.net/web-security/essential-skills/lab-scanning-non-standard-data-structures', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  console.log('Page URL:', page.url());
  console.log('Title:', await page.title());
  
  // Check if already solved
  const solvedBadge = await page.locator('text=Solved').count();
  console.log('Solved badge:', solvedBadge);
  
  // Find access button
  const buttons = await page.locator('a, button').all();
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && (text.includes('Access') || text.includes('LAB') || text.includes('Start'))) {
      console.log('Found button:', text.trim());
    }
  }

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
