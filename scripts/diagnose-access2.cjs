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
  
  console.log('Page title:', await page.title());
  
  const buttons = await page.locator('button, a, [role="button"]').all();
  console.log(`\nTotal interactive elements: ${buttons.length}`);
  for (const btn of buttons) {
    const text = await btn.textContent();
    const visible = await btn.isVisible().catch(() => false);
    if (text && text.trim() && visible) {
      const tag = await btn.evaluate(el => el.tagName);
      const cls = await btn.getAttribute('class');
      console.log(`  "${text.trim()}" (tag: ${tag}, class: ${cls || 'none'})`);
    }
  }

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
