const { chromium } = require('playwright');
const fs = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  // Login
  await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  await page.waitForTimeout(2000);
  
  // Launch deserialization lab #6
  await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const labLink = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
    const topicLinks = links.filter(el => {
      const a = el.querySelector('a');
      return a?.getAttribute('href')?.includes('/web-security/deserialization/');
    });
    const target = topicLinks[5]; // lab #6
    if (target?.className.includes('is-solved')) return 'SOLVED';
    return target?.querySelector('a')?.getAttribute('href') || null;
  });
  
  if (labLink === 'SOLVED') {
    console.log('Lab already solved, trying lab #8');
    // Try lab 8
    const labLink8 = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      const topicLinks = links.filter(el => {
        const a = el.querySelector('a');
        return a?.getAttribute('href')?.includes('/web-security/deserialization/');
      });
      const target = topicLinks[7]; // lab #8
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    });
    
    if (labLink8 === 'SOLVED') {
      console.log('Lab 8 also solved');
      await browser.close();
      return;
    }
    
    await page.goto('https://portswigger.net' + labLink8, { waitUntil: 'networkidle', timeout: 30000 });
  } else {
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
  }
  
  const launchLink = await page.$('a[href*="labs/launch"]');
  if (!launchLink) { console.log('No launch link'); await browser.close(); return; }
  
  await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(45000);
  
  const labUrl = page.url();
  if (!labUrl.includes('web-security-academy.net')) {
    console.log('Lab did not load');
    await browser.close();
    return;
  }
  
  const base = new URL(labUrl).origin;
  console.log(`Lab URL: ${base}`);
  
  // Fetch main page HTML
  await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
  const mainHtml = await page.content();
  fs.writeFileSync('/tmp/deser-main.html', mainHtml);
  console.log('Saved main page HTML to /tmp/deser-main.html');
  
  // Fetch login page HTML
  await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  const loginHtml = await page.content();
  fs.writeFileSync('/tmp/deser-login.html', loginHtml);
  console.log('Saved login page HTML to /tmp/deser-login.html');
  
  // Look for comments
  const comments = await page.evaluate(() => {
    return [...document.querySelectorAll('*')].map(el => el.nodeType === 8 ? el.data : null).filter(Boolean);
  });
  console.log('HTML comments found:', comments);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
