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

  // Check EssentialSkills#2
  await page.goto('https://portswigger.net/web-security/essential-skills/lab-scanning-non-standard-data-structures', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const [newPage] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 15000 }),
    page.click('text=ACCESS THE LAB'),
  ]);
  await newPage.waitForLoadState('networkidle', { timeout: 15000 });
  await newPage.waitForTimeout(3000);
  
  console.log('Lab URL:', newPage.url());
  console.log('Title:', await newPage.title());
  
  // Explore the lab
  const links = await newPage.locator('a').all();
  console.log('\nLinks:');
  for (const link of links.slice(0, 20)) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    if (text && text.trim()) {
      console.log(`  ${text.trim()}: ${href}`);
    }
  }

  // Check for forms
  const forms = await newPage.locator('form').all();
  console.log(`\nForms: ${forms.length}`);
  
  // Check page content for hints
  const body = await newPage.content();
  if (body.includes('admin')) console.log('Found admin reference');
  if (body.includes('API')) console.log('Found API reference');
  if (body.includes('XML')) console.log('Found XML reference');
  if (body.includes('JSON')) console.log('Found JSON reference');

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
