const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function launchLab(browser, page, labHref) {
  await page.goto('https://portswigger.net' + labHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  
  // Get current URL before clicking
  const beforeUrl = page.url();
  console.log(`  Before click: ${beforeUrl}`);
  
  // Find and click the access button
  const accessBtn = await page.locator('a:has-text("ACCESS THE LAB")').first();
  if (await accessBtn.count() === 0) {
    console.log('  No access button found');
    return null;
  }
  
  // Click and wait for navigation
  await accessBtn.click();
  await sleep(10000);
  
  // Check if current page navigated
  const afterUrl = page.url();
  console.log(`  After click: ${afterUrl}`);
  
  if (!afterUrl.includes('portswigger.net') && afterUrl !== 'about:blank') {
    return { url: afterUrl, page };
  }
  
  // Check for new pages/tabs
  const pages = browser.contexts()[0].pages();
  console.log(`  Total pages: ${pages.length}`);
  
  for (const p of pages) {
    const url = p.url();
    console.log(`    Page URL: ${url}`);
    if (url && url !== 'about:blank' && !url.includes('portswigger.net') && url !== beforeUrl) {
      return { url, page: p };
    }
  }
  
  return null;
}

async function runSolver(lab, baseUrl) {
  const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;
  
  if (!fs.existsSync(solverPath)) {
    console.log(`  Solver not found: ${solverPath}`);
    return false;
  }
  
  const content = fs.readFileSync(solverPath, 'utf8');
  if (content.includes('WIP') || content.trim().split('\n').length < 10) {
    console.log(`  Solver is incomplete/stub`);
    return false;
  }
  
  const cmd = `python3 -u "${solverPath}" -U "${baseUrl}"`;
  
  try {
    const output = execSync(cmd, {
      timeout: 300000,
      encoding: 'utf-8',
      cwd: `/tmp/wsa-solutions/${lab.dir}`,
    });
    console.log('  Output:', output.slice(0, 300));
    return true;
  } catch (e) {
    console.log('  Solver failed:', e.message?.slice(0, 200));
    if (e.stdout) console.log('  Stdout:', e.stdout.slice(0, 300));
    if (e.stderr) console.log('  Stderr:', e.stderr.slice(0, 300));
    return false;
  }
}

async function verifyLab(page, baseUrl) {
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    const body = await page.content();
    return body.toLowerCase().includes('congratulations');
  } catch (e) {
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Login
  await page.goto('https://portswigger.net/users', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await page.click('#Login');
  await sleep(5000);

  // Get labs
  await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

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

  const labs = [
    { topic: 'logic-flaws', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py', name: 'BusinessLogic#5' },
    { topic: 'logic-flaws', num: 10, dir: 'BusinessLogic', script: 'exploit-lab10.py', name: 'BusinessLogic#10' },
    { topic: 'host-header', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py', name: 'HostHeader#3' },
    { topic: 'nosql-injection', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py', name: 'NoSQL#4' },
    { topic: 'oauth', num: 3, dir: 'OAuth', script: 'exploit-lab02.py', name: 'OAuth#3' },
    { topic: 'oauth', num: 5, dir: 'OAuth', script: 'exploit-lab04.py', name: 'OAuth#5' },
    { topic: 'deserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py', name: 'InsecureDeserialization#6' },
    { topic: 'authentication', num: 5, dir: 'Authentication', script: 'exploit-lab05.py', name: 'Authentication#5' },
  ];

  let solved = 0;
  let failed = 0;

  for (const lab of labs) {
    try {
      const topicLabs = allLabs[lab.topic] || [];
      if (lab.num > topicLabs.length) {
        console.log(`\n[${lab.name}] Lab not found`);
        failed++;
        continue;
      }
      
      const targetLab = topicLabs[lab.num - 1];
      if (!targetLab || targetLab.isSolved) {
        console.log(`\n[${lab.name}] Already solved`);
        continue;
      }

      console.log(`\n[${lab.name}] ${targetLab.title}`);
      
      const result = await launchLab(browser, page, targetLab.href);
      if (!result) {
        console.log('  Failed to launch lab');
        failed++;
        continue;
      }
      
      console.log(`  Lab URL: ${result.url}`);
      
      const solverOk = await runSolver(lab, result.url);
      
      const isSolved = await verifyLab(result.page, result.url);
      if (isSolved) {
        console.log('  SOLVED!');
        solved++;
      } else {
        console.log('  Not solved');
        failed++;
      }
      
      if (result.page !== page) {
        await result.page.close().catch(() => {});
      }
      
      await sleep(30000);
    } catch (e) {
      console.log(`\n[${lab.name}] Error: ${e.message?.slice(0, 200)}`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed`);
  console.log(`========================================`);

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
