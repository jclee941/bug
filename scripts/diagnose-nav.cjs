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

  await page.goto('https://portswigger.net/web-security/sql-injection/blind/lab-out-of-band-data-exfiltration', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  console.log('Before click URL:', page.url());
  
  // Check if button opens new tab
  const [newPage] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null),
    page.click('text=ACCESS THE LAB'),
  ]);
  
  await page.waitForTimeout(5000);
  
  if (newPage) {
    console.log('New page opened!');
    console.log('New page URL:', newPage.url());
    await newPage.close();
  } else {
    console.log('No new page');
    console.log('After click URL:', page.url());
  }

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
