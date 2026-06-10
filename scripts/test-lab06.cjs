const { chromium } = require('playwright');
const { execSync } = require('child_process');

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
    console.log('Already solved');
    await browser.close();
    return;
  }
  
  await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
  const launchLink = await page.$('a[href*="labs/launch"]');
  await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForTimeout(45000);
  
  const base = new URL(page.url()).origin;
  console.log(`Lab URL: ${base}`);
  
  try {
    const output = execSync(`python3 "/tmp/wsa-solutions/InsecureDeserialization/exploit-lab06.py" -U "${base}"`, {
      timeout: 300000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: '/tmp/wsa-solutions/InsecureDeserialization',
    });
    console.log(output);
  } catch (e) {
    console.log('Output:', e.stdout);
    console.log('Stderr:', e.stderr);
  }
  
  await page.waitForTimeout(3000);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const body = await page.textContent('body').catch(() => '');
  console.log(body.toLowerCase().includes('congratulations') ? 'SOLVED!' : 'Not solved');
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
