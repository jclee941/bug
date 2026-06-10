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
  'SQLInjection': 'sql-injection',
  'XSS': 'cross-site-scripting',
  'SSRF': 'ssrf',
  'OSCommandInjection': 'os-command-injection',
};

async function runLab(topic, num, dir, script, timeout = 300000, collab = null) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  try {
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

    const topicSlug = topicMap[topic];
    const topicLabs = allLabs[topicSlug] || [];
    
    if (num > topicLabs.length) {
      console.log(`[${topic}#${num}] Lab number out of range`);
      return false;
    }
    
    const targetLab = topicLabs[num - 1];
    if (!targetLab || targetLab.isSolved) {
      console.log(`[${topic}#${num}] Already solved or not found`);
      return false;
    }

    console.log(`\n[${topic}#${num}] ${targetLab.title}`);
    
    await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const [newPage] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }),
      page.click('text=ACCESS THE LAB'),
    ]);
    await newPage.waitForLoadState('networkidle', { timeout: 15000 });
    await newPage.waitForTimeout(3000);

    const base = new URL(newPage.url()).origin;
    const solverPath = `/tmp/wsa-solutions/${dir}/${script}`;

    console.log(`  Lab URL: ${base}`);
    
    const cmd = collab 
      ? `python3 "${solverPath}" -U "${base}" -C "${collab}"`
      : `python3 "${solverPath}" -U "${base}"`;
      
    const output = execSync(cmd, {
      timeout: timeout,
      encoding: 'utf-8',
      cwd: `/tmp/wsa-solutions/${dir}`,
    });
    console.log('  Output:', output.slice(0, 500));

    await newPage.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
    await newPage.waitForTimeout(2000);
    const body = await newPage.content();
    if (body.toLowerCase().includes('congratulations')) {
      console.log(`  SOLVED!`);
      return true;
    } else {
      console.log(`  Not solved`);
      return false;
    }
  } catch (e) {
    console.log(`  Error: ${e.message?.slice(0, 200)}`);
    if (e.stderr) console.log(`  Stderr: ${e.stderr.slice(0, 500)}`);
    return false;
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function main() {
  // Run a list of high-probability labs
  const labs = [
    { topic: 'Websockets', num: 3, dir: 'Websockets', script: 'exploit-lab03.py', fixProxy: true },
    { topic: 'BusinessLogic', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py' },
    { topic: 'BusinessLogic', num: 10, dir: 'BusinessLogic', script: 'exploit-lab10.py' },
    { topic: 'BusinessLogic', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py' },
    { topic: 'HostHeader', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py' },
    { topic: 'NoSQL', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py' },
    { topic: 'PrototypePollution', num: 5, dir: 'PrototypePollution', script: 'exploit-lab05.py' },
    { topic: 'InsecureDeserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py' },
  ];

  let solved = 0;
  let failed = 0;

  for (const lab of labs) {
    // Fix proxy if needed
    if (lab.fixProxy) {
      const fs = require('fs');
      const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;
      let content = fs.readFileSync(solverPath, 'utf8');
      content = content.replace(/http_proxy_host="127\.0\.0\.1"/, 'http_proxy_host=None');
      content = content.replace(/http_proxy_port="8080"/, 'http_proxy_port=None');
      content = content.replace(/proxy_type="http"/, 'proxy_type=None');
      fs.writeFileSync(solverPath, content);
    }

    const result = await runLab(lab.topic, lab.num, lab.dir, lab.script, lab.timeout || 300000);
    if (result) solved++;
    else failed++;
  }

  console.log(`\n========================================`);
  console.log(`Quick Wins Result: ${solved} solved, ${failed} failed`);
  console.log(`========================================`);
}

main().catch(e => { console.error(e); process.exit(1); });
