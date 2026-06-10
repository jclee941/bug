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

  await page.goto('https://portswigger.net/web-security/essential-skills/using-burp-scanner-during-manual-testing/lab-scanning-non-standard-data-structures', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  console.log('Page URL:', page.url());
  console.log('Title:', await page.title());
  
  // Click access lab
  await page.click('text=ACCESS THE LAB');
  await page.waitForTimeout(5000);
  
  console.log('After click URL:', page.url());
  
  // If new page opened, use it
  const pages = ctx.pages();
  const labPage = pages.length > 1 ? pages[pages.length - 1] : page;
  
  console.log('Lab URL:', labPage.url());
  console.log('Lab Title:', await labPage.title());
  
  // Explore the lab
  const links = await labPage.locator('a').all();
  console.log('\nLinks:');
  for (const link of links.slice(0, 30)) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    if (text && text.trim() && href && !href.startsWith('https://portswigger.net')) {
      console.log(`  "${text.trim()}" -> ${href}`);
    }
  }

  const body = await labPage.content();
  console.log('\nContent checks:');
  ['admin', 'API', 'XML', 'JSON', 'post', 'product', 'search', 'form', 'input'].forEach(word => {
    if (body.toLowerCase().includes(word)) console.log(`  Found: ${word}`);
  });

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
