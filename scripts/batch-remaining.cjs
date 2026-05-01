const { chromium } = require('playwright');
const { execSync } = require('child_process');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

const topicMap = {
  'SQLInjection': 'sql-injection',
  'Authentication': 'authentication',
  'Websockets': 'websockets',
  'WebCachePoisoning': 'web-cache-poisoning',
  'InsecureDeserialization': 'deserialization',
  'BusinessLogic': 'logic-flaws',
  'HostHeader': 'host-header',
  'OAuth': 'oauth',
  'PrototypePollution': 'prototype-pollution',
  'NoSQL': 'nosql-injection',
  'RequestSmuggling': 'request-smuggling',
};

const remainingLabs = [
  { topic: 'SQLInjection', num: 11, dir: 'SQLInjection', script: 'exploit-lab11.py', timeout: 600000 },
  { topic: 'SQLInjection', num: 12, dir: 'SQLInjection', script: 'exploit-lab12.py', timeout: 600000 },
  { topic: 'SQLInjection', num: 15, dir: 'SQLInjection', script: 'exploit-lab15.py', timeout: 600000 },
  { topic: 'Authentication', num: 5, dir: 'Authentication', script: 'exploit-lab05.py', timeout: 600000 },
  { topic: 'Websockets', num: 3, dir: 'Websockets', script: 'exploit-lab03.py', timeout: 300000, fixProxy: true },
  { topic: 'WebCachePoisoning', num: 5, dir: 'WebCachePoisoning', script: 'exploit-lab05.py', timeout: 300000 },
  { topic: 'WebCachePoisoning', num: 6, dir: 'WebCachePoisoning', script: 'exploit-lab06.py', timeout: 300000 },
  { topic: 'WebCachePoisoning', num: 9, dir: 'WebCachePoisoning', script: 'exploit-lab09.py', timeout: 300000 },
  { topic: 'InsecureDeserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py', timeout: 300000 },
  { topic: 'BusinessLogic', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py', timeout: 300000 },
  { topic: 'BusinessLogic', num: 10, dir: 'BusinessLogic', script: 'exploit-lab10.py', timeout: 300000 },
  { topic: 'BusinessLogic', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py', timeout: 300000 },
  { topic: 'HostHeader', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py', timeout: 300000 },
  { topic: 'OAuth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py', timeout: 300000 },
  { topic: 'OAuth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py', timeout: 300000 },
  { topic: 'PrototypePollution', num: 5, dir: 'PrototypePollution', script: 'exploit-lab05.py', timeout: 300000 },
  { topic: 'NoSQL', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 6, dir: 'RequestSmuggling', script: 'exploit-lab06.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 12, dir: 'RequestSmuggling', script: 'exploit-lab12.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 13, dir: 'RequestSmuggling', script: 'exploit-lab13.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 14, dir: 'RequestSmuggling', script: 'exploit-lab14.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 15, dir: 'RequestSmuggling', script: 'exploit-lab15.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 16, dir: 'RequestSmuggling', script: 'exploit-lab16.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 17, dir: 'RequestSmuggling', script: 'exploit-lab17.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 18, dir: 'RequestSmuggling', script: 'exploit-lab18.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 19, dir: 'RequestSmuggling', script: 'exploit-lab19.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 20, dir: 'RequestSmuggling', script: 'exploit-lab20.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 21, dir: 'RequestSmuggling', script: 'exploit-lab21.py', timeout: 300000 },
  { topic: 'RequestSmuggling', num: 22, dir: 'RequestSmuggling', script: 'exploit-lab22.py', timeout: 300000 },
];

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

  let solved = 0;
  let failed = 0;
  let skipped = 0;

  for (const lab of remainingLabs) {
    const topicSlug = topicMap[lab.topic];
    const topicLabs = allLabs[topicSlug] || [];
    
    if (lab.num > topicLabs.length) {
      console.log(`[${lab.topic}#${lab.num}] Lab number out of range (topic has ${topicLabs.length} labs)`);
      skipped++;
      continue;
    }
    
    const targetLab = topicLabs[lab.num - 1];
    
    if (!targetLab) {
      console.log(`[${lab.topic}#${lab.num}] Lab not found`);
      skipped++;
      continue;
    }
    
    if (targetLab.isSolved) {
      console.log(`[${lab.topic}#${lab.num}] Already solved: ${targetLab.title}`);
      skipped++;
      continue;
    }

    console.log(`\n[${lab.topic}#${lab.num}] ${targetLab.title}`);
    
    await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const [newPage] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }),
      page.click('text=ACCESS THE LAB'),
    ]);
    await newPage.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForTimeout(3000);

    const base = new URL(newPage.url()).origin;
    const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;

    if (lab.fixProxy) {
      const fs = require('fs');
      let content = fs.readFileSync(solverPath, 'utf8');
      content = content.replace(/http_proxy_host="127\.0\.0\.1"/, 'http_proxy_host=None');
      content = content.replace(/http_proxy_port="8080"/, 'http_proxy_port=None');
      content = content.replace(/proxy_type="http"/, 'proxy_type=None');
      fs.writeFileSync(solverPath, content);
    }

    try {
      console.log(`  Lab URL: ${base}`);
      const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
        timeout: lab.timeout || 300000,
        encoding: 'utf-8',
        cwd: `/tmp/wsa-solutions/${lab.dir}`,
      });
      console.log('  Output:', output.slice(0, 500));

      await newPage.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
      await newPage.waitForTimeout(2000);
      const body = await newPage.content();
      if (body.toLowerCase().includes('congratulations')) {
        console.log(`  SOLVED!`);
        solved++;
      } else {
        console.log(`  Not solved`);
        failed++;
      }
    } catch (e) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
      if (e.stderr) console.log(`  Stderr: ${e.stderr.slice(0, 500)}`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Remaining Batch Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================`);

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
