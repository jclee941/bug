const { chromium } = require('playwright');
const { execSync } = require('child_process');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

const topicMap = {
  'Websockets': 'websockets',
  'BusinessLogic': 'logic-flaws',
  'HostHeader': 'host-header',
  'NoSQL': 'nosql-injection',
  'PrototypePollution': 'prototype-pollution',
  'InsecureDeserialization': 'deserialization',
  'OAuth': 'oauth',
  'WebCachePoisoning': 'web-cache-poisoning',
};

async function main() {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log('Logging in...');
  try {
    await page.goto('https://portswigger.net/users', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded, filling form...');
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    console.log('Clicking login...');
    await page.click('#Login');
    await page.waitForTimeout(5000);
    console.log('Login done, URL:', page.url());
  } catch (e) {
    console.log('Login error:', e.message);
    await browser.close();
    return;
  }

  console.log('Getting labs...');
  try {
    await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('All-labs error:', e.message);
    await browser.close();
    return;
  }

  const allLabs = await page.evaluate(() => {
    const results = {};
    const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
    links.forEach((el) => {
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

  console.log(`Found ${Object.keys(allLabs).length} topics`);

  const labs = [
    { topic: 'BusinessLogic', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py' },
    { topic: 'BusinessLogic', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py' },
    { topic: 'HostHeader', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py' },
    { topic: 'NoSQL', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py' },
    { topic: 'InsecureDeserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py' },
  ];

  let solved = 0;
  let failed = 0;

  for (const lab of labs) {
    try {
      const topicSlug = topicMap[lab.topic];
      const topicLabs = allLabs[topicSlug] || [];
      
      if (lab.num > topicLabs.length) {
        console.log(`[${lab.topic}#${lab.num}] Lab number out of range`);
        failed++;
        continue;
      }
      
      const targetLab = topicLabs[lab.num - 1];
      if (!targetLab || targetLab.isSolved) {
        console.log(`[${lab.topic}#${lab.num}] Already solved or not found`);
        continue;
      }

      console.log(`\n[${lab.topic}#${lab.num}] ${targetLab.title}`);
      
      await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      const [newPage] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 15000 }),
        page.click('text=ACCESS THE LAB'),
      ]);
      await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await page.waitForTimeout(5000);

      let base = newPage.url();
      if (!base || base === 'about:blank') {
        await page.waitForTimeout(5000);
        base = newPage.url();
      }
      if (!base || base === 'about:blank') {
        console.log(`  Failed to get lab URL`);
        failed++;
        continue;
      }
      
      base = new URL(base).origin;
      const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;

      console.log(`  Lab URL: ${base}`);
      
      const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
        timeout: 300000,
        encoding: 'utf-8',
        cwd: `/tmp/wsa-solutions/${lab.dir}`,
      });
      console.log('  Output:', output.slice(0, 500));

      await newPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await newPage.waitForTimeout(2000);
      const body = await newPage.content();
      if (body.toLowerCase().includes('congratulations')) {
        console.log(`  SOLVED!`);
        solved++;
      } else {
        console.log(`  Not solved`);
        failed++;
      }
      
      await newPage.close();
      await page.waitForTimeout(30000);
      
    } catch (e) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
      if (e.stderr) console.log(`  Stderr: ${e.stderr.slice(0, 500)}`);
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
