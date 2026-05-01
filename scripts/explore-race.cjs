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

  await page.goto('https://portswigger.net/web-security/race-conditions/lab-race-conditions-limit-overrun', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const [newPage] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null),
    page.click('text=ACCESS THE LAB'),
  ]);
  
  const labPage = newPage || page;
  await labPage.waitForTimeout(5000);
  
  console.log('Lab URL:', labPage.url());
  console.log('Title:', await labPage.title());
  
  // Explore
  const links = await labPage.locator('a').all();
  console.log('\nLinks:');
  for (const link of links.slice(0, 20)) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    if (text && text.trim() && href && !href.startsWith('https://portswigger.net')) {
      console.log(`  "${text.trim()}" -> ${href}`);
    }
  }

  const body = await labPage.content();
  console.log('\nContent checks:');
  ['coupon', 'gift', 'cart', 'add', 'buy', 'purchase', 'code', 'voucher', 'apply'].forEach(word => {
    if (body.toLowerCase().includes(word)) console.log(`  Found: ${word}`);
  });

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
