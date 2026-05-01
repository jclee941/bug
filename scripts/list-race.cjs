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

  await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const labs = await page.evaluate(() => {
    const results = [];
    const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
    links.forEach((el) => {
      const a = el.querySelector('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const title = a.textContent?.trim() || '';
      const isSolved = el.className.includes('is-solved');
      const match = href.match(/\/web-security\/([^/]+)/);
      const topic = match ? match[1] : '';
      if (topic === 'race-conditions') {
        results.push({ title, href, isSolved });
      }
    });
    return results;
  });

  console.log(`RaceConditions labs: ${labs.length}`);
  labs.forEach((lab, i) => {
    console.log(`  #${i+1}: ${lab.isSolved ? '[SOLVED]' : '[UNSOLVED]'} ${lab.title}`);
    console.log(`       ${lab.href}`);
  });

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
