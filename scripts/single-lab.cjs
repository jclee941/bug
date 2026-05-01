const { chromium } = require('playwright');
const { execSync } = require('child_process');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSingleLab(topicPath, labNum, dir, script, timeout = 300000) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  try {
    // Login
    console.log('Logging in...');
    await page.goto('https://portswigger.net/users', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await page.click('#Login');
    await sleep(5000);

    // Get labs
    await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    const allLabs = await page.evaluate(() => {
      const results = {};
      document.querySelectorAll('.widgetcontainer-lab-link').forEach((el) => {
        const a = el.querySelector('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        const title = a.textContent?.trim() || '';
        const isSolved = el.className.includes('is-solved');
        const match = href.match(/\/web-security\/([^/]+)/);
        const topic = match ? match[1] : '';
        if (!topic) return;
        if (!results[topic]) results[topic] = [];
        results[topic].push({ title, href, isSolved });
      });
      return results;
    });

    const topicLabs = allLabs[topicPath] || [];
    if (labNum > topicLabs.length) {
      console.log(`Lab #${labNum} not found in topic`);
      return false;
    }

    const targetLab = topicLabs[labNum - 1];
    if (!targetLab || targetLab.isSolved) {
      console.log(`Lab already solved or not found`);
      return false;
    }

    console.log(`\nLab: ${targetLab.title}`);

    // Launch lab
    await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    let labPage;
    try {
      const [np] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 15000 }),
        page.click('text=ACCESS THE LAB'),
      ]);
      labPage = np;
    } catch (e) {
      await page.click('text=ACCESS THE LAB');
      await sleep(5000);
      labPage = page;
    }

    await labPage.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await sleep(60000); // Wait 60 seconds for lab to fully initialize

    let base = labPage.url();
    if (!base || base === 'about:blank') {
      console.log('Failed to get lab URL');
      return false;
    }

    base = new URL(base).origin;
    console.log(`Lab URL: ${base}`);

    // Run solver with retries
    const solverPath = `/tmp/wsa-solutions/${dir}/${script}`;
    let solved = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`Running solver (attempt ${attempt + 1})...`);
        const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
          timeout: timeout,
          encoding: 'utf-8',
          cwd: `/tmp/wsa-solutions/${dir}`,
        });
        console.log('Solver output:', output.slice(0, 300));
        solved = true;
        break;
      } catch (e) {
        console.log(`Solver attempt ${attempt + 1} failed:`, e.message?.slice(0, 200));
        if (e.stderr) console.log('Stderr:', e.stderr.slice(0, 300));
        if (attempt < 2) {
          console.log('Waiting 20s before retry...');
          await sleep(20000);
        }
      }
    }

    // Verify
    console.log('Verifying...');
    await labPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    const body = await labPage.content();
    if (body.toLowerCase().includes('congratulations')) {
      console.log('SOLVED!');
      return true;
    } else {
      console.log('Not solved');
      return false;
    }

  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function main() {
  // Test with BusinessLogic #5
  const result = await runSingleLab('logic-flaws', 5, 'BusinessLogic', 'exploit-lab05.py');
  console.log(`\nResult: ${result ? 'SOLVED' : 'FAILED'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
