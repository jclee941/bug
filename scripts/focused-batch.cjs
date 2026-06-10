const { chromium } = require('playwright');
const { execSync } = require('child_process');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

const topicMap = {
  'BusinessLogic': 'logic-flaws',
  'HostHeader': 'host-header',
  'NoSQL': 'nosql-injection',
  'OAuth': 'oauth',
  'PrototypePollution': 'prototype-pollution',
  'InsecureDeserialization': 'deserialization',
  'WebCachePoisoning': 'web-cache-poisoning',
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  const labs = [
    { topic: 'BusinessLogic', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py' },
    { topic: 'HostHeader', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py' },
    { topic: 'NoSQL', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py' },
    { topic: 'OAuth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py' },
    { topic: 'OAuth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py' },
    { topic: 'PrototypePollution', num: 5, dir: 'PrototypePollution', script: 'exploit-lab05.py' },
    { topic: 'InsecureDeserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py' },
    { topic: 'WebCachePoisoning', num: 5, dir: 'WebCachePoisoning', script: 'exploit-lab05.py' },
    { topic: 'WebCachePoisoning', num: 6, dir: 'WebCachePoisoning', script: 'exploit-lab06.py' },
    { topic: 'WebCachePoisoning', num: 9, dir: 'WebCachePoisoning', script: 'exploit-lab09.py' },
  ];

  let solved = 0;
  let failed = 0;

  for (const lab of labs) {
    try {
      const topicSlug = topicMap[lab.topic];
      const topicLabs = allLabs[topicSlug] || [];
      
      if (lab.num > topicLabs.length) {
        console.log(`[${lab.topic}#${lab.num}] Not found`);
        failed++;
        continue;
      }
      
      const targetLab = topicLabs[lab.num - 1];
      if (!targetLab || targetLab.isSolved) {
        console.log(`[${lab.topic}#${lab.num}] Already solved`);
        continue;
      }

      console.log(`\n[${lab.topic}#${lab.num}] ${targetLab.title}`);
      
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
      await sleep(15000);

      let base = labPage.url();
      if (!base || base === 'about:blank') {
        console.log(`  Failed to get lab URL`);
        failed++;
        continue;
      }
      
      base = new URL(base).origin;
      const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;

      console.log(`  Lab URL: ${base}`);
      
      // Run solver with python3 -u for unbuffered output
      const cmd = `python3 -u "${solverPath}" -U "${base}"`;
      
      let output = '';
      try {
        output = execSync(cmd, {
          timeout: 300000,
          encoding: 'utf-8',
          cwd: `/tmp/wsa-solutions/${lab.dir}`,
        });
      } catch (e) {
        output = e.stdout || '';
        console.log('  Solver stderr:', e.stderr?.slice(0, 300));
      }
      console.log('  Output:', output.slice(0, 300));

      await labPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);
      const body = await labPage.content();
      if (body.toLowerCase().includes('congratulations')) {
        console.log(`  SOLVED!`);
        solved++;
      } else {
        console.log(`  Not solved`);
        failed++;
      }
      
      await labPage.close().catch(() => {});
      await sleep(30000);
      
    } catch (e) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
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
