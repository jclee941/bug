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
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  console.log('Page title:', await page.title());
  console.log('Has Access lab button:', await page.locator('text=Access lab').count());
  console.log('Has access lab link:', await page.locator('text=Access lab').count());
  
  // Try to find any button or link
  const buttons = await page.locator('button, a').all();
  for (const btn of buttons.slice(0, 20)) {
    const text = await btn.textContent();
    if (text && (text.includes('Access') || text.includes('lab') || text.includes('Start'))) {
      console.log('Found:', text.trim(), '- tag:', await btn.evaluate(el => el.tagName));
    }
  }

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
