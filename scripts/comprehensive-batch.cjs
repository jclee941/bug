const { chromium } = require('playwright');
const { execSync } = require('child_process');
const https = require('https');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const COLLAB = process.env.COLLAB_DOMAIN || 'd7j9tts2olvgic6776g0y766ekedfq6s1.oast.live';

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
  'XSS': 'cross-site-scripting',
  'SSRF': 'ssrf',
  'OSCommandInjection': 'os-command-injection',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollInteractsh(domain, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = execSync(`interactsh-client -d ${domain} -json`, { 
        timeout: 10000, 
        encoding: 'utf-8' 
      }).trim();
      if (result && result.includes('"protocol"')) {
        return JSON.parse(result);
      }
    } catch (e) {}
    await sleep(5000);
  }
  return null;
}

async function runLab(page, ctx, lab, allLabs) {
  const topicSlug = topicMap[lab.topic];
  const topicLabs = allLabs[topicSlug] || [];
  
  if (lab.num > topicLabs.length) {
    console.log(`[${lab.topic}#${lab.num}] Lab number out of range`);
    return false;
  }
  
  const targetLab = topicLabs[lab.num - 1];
  if (!targetLab || targetLab.isSolved) {
    console.log(`[${lab.topic}#${lab.num}] Already solved or not found`);
    return false;
  }

  console.log(`\n[${lab.topic}#${lab.num}] ${targetLab.title}`);
  
  await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  
  let newPage;
  try {
    const [np] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }),
      page.click('text=ACCESS THE LAB'),
    ]);
    newPage = np;
  } catch (e) {
    // Try same-page navigation
    await page.click('text=ACCESS THE LAB');
    await sleep(5000);
    newPage = page;
  }
  
  await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await sleep(30000); // Wait for lab to fully initialize
  await sleep(10000); // Wait for lab to fully initialize

  let base = newPage.url();
  if (!base || base === 'about:blank') {
    await sleep(5000);
    base = newPage.url();
  }
  if (!base || base === 'about:blank') {
    console.log(`  Failed to get lab URL`);
    return false;
  }
  
  base = new URL(base).origin;
  console.log(`  Lab URL: ${base}`);

    // Try Python solver if available
  if (lab.script) {
    const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;
    
    // Fix proxy if needed
    if (lab.fixProxy) {
      const fs = require('fs');
      let content = fs.readFileSync(solverPath, 'utf8');
      content = content.replace(/http_proxy_host="127\.0\.0\.1"/, 'http_proxy_host=None');
      content = content.replace(/http_proxy_port="8080"/, 'http_proxy_port=None');
      content = content.replace(/proxy_type="http"/, 'proxy_type=None');
      fs.writeFileSync(solverPath, content);
    }
    
    const cmd = lab.collab 
      ? `python3 "${solverPath}" -U "${base}" -C "${COLLAB}"`
      : `python3 "${solverPath}" -U "${base}"`;
    
    let solverSuccess = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const output = execSync(cmd, {
          timeout: lab.timeout || 300000,
          encoding: 'utf-8',
          cwd: `/tmp/wsa-solutions/${lab.dir}`,
        });
        console.log('  Solver output:', output.slice(0, 300));
        solverSuccess = true;
        break;
      } catch (e) {
        console.log(`  Solver attempt ${attempt + 1} failed:`, e.message?.slice(0, 200));
        if (attempt < 2) {
          console.log('  Retrying in 15s...');
          await sleep(15000);
        }
      }
    }
    if (!solverSuccess) {
      console.log('  All solver attempts failed');
    }
  }
  if (lab.script) {
    const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;
    
    // Fix proxy if needed
    if (lab.fixProxy) {
      const fs = require('fs');
      let content = fs.readFileSync(solverPath, 'utf8');
      content = content.replace(/http_proxy_host="127\.0\.0\.1"/, 'http_proxy_host=None');
      content = content.replace(/http_proxy_port="8080"/, 'http_proxy_port=None');
      content = content.replace(/proxy_type="http"/, 'proxy_type=None');
      fs.writeFileSync(solverPath, content);
    }
    
    const cmd = lab.collab 
      ? `python3 "${solverPath}" -U "${base}" -C "${COLLAB}"`
      : `python3 "${solverPath}" -U "${base}"`;
    
    try {
      const output = execSync(cmd, {
        timeout: lab.timeout || 300000,
        encoding: 'utf-8',
        cwd: `/tmp/wsa-solutions/${lab.dir}`,
      });
      console.log('  Solver output:', output.slice(0, 300));
    } catch (e) {
      console.log('  Solver failed:', e.message?.slice(0, 200));
    }
  }

  // Verify
  await newPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(3000);
  const body = await newPage.content();
  if (body.toLowerCase().includes('congratulations')) {
    console.log(`  SOLVED!`);
    return true;
  }
  
  console.log(`  Not solved`);
  return false;
}

async function main() {
  console.log('Starting comprehensive solver...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Login
  console.log('Logging in...');
  await page.goto('https://portswigger.net/users', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await page.click('#Login');
  await sleep(5000);
  console.log('Login done');

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

  console.log(`Found ${Object.values(allLabs).reduce((a, b) => a + b.length, 0)} total labs`);

  // Define all remaining labs
  const labs = [
    // Category 1: Likely solvable with existing solvers
    { topic: 'BusinessLogic', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py' },
    { topic: 'BusinessLogic', num: 10, dir: 'BusinessLogic', script: 'exploit-lab10.py' },
    { topic: 'BusinessLogic', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py' },
    { topic: 'HostHeader', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py' },
    { topic: 'NoSQL', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py' },
    { topic: 'PrototypePollution', num: 5, dir: 'PrototypePollution', script: 'exploit-lab05.py' },
    { topic: 'InsecureDeserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py' },
    { topic: 'OAuth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py' },
    { topic: 'OAuth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py' },
    { topic: 'WebCachePoisoning', num: 5, dir: 'WebCachePoisoning', script: 'exploit-lab05.py' },
    { topic: 'WebCachePoisoning', num: 6, dir: 'WebCachePoisoning', script: 'exploit-lab06.py' },
    { topic: 'WebCachePoisoning', num: 9, dir: 'WebCachePoisoning', script: 'exploit-lab09.py' },
    { topic: 'Authentication', num: 5, dir: 'Authentication', script: 'exploit-lab05.py', timeout: 600000 },
    { topic: 'Websockets', num: 3, dir: 'Websockets', script: 'exploit-lab03.py', fixProxy: true },
    
    // Category 2: OOB labs
    { topic: 'SQLInjection', num: 17, dir: 'SQLInjection', script: 'exploit-lab17.py', collab: true },
    { topic: 'SSRF', num: 6, dir: 'SSRF', script: 'exploit-lab06.py', collab: true },
    { topic: 'OSCommandInjection', num: 4, dir: 'OSCommandInjection', script: 'exploit-lab04.py', collab: true },
    { topic: 'OSCommandInjection', num: 5, dir: 'OSCommandInjection', script: 'exploit-lab05.py', collab: true },
    
    // Category 3: Long-running
    { topic: 'SQLInjection', num: 11, dir: 'SQLInjection', script: 'exploit-lab11.py', timeout: 600000 },
    { topic: 'SQLInjection', num: 12, dir: 'SQLInjection', script: 'exploit-lab12.py', timeout: 600000 },
    { topic: 'SQLInjection', num: 15, dir: 'SQLInjection', script: 'exploit-lab15.py', timeout: 600000 },
    
    // Category 4: RequestSmuggling
    { topic: 'RequestSmuggling', num: 6, dir: 'RequestSmuggling', script: 'exploit-lab06.py' },
    { topic: 'RequestSmuggling', num: 12, dir: 'RequestSmuggling', script: 'exploit-lab12.py' },
    { topic: 'RequestSmuggling', num: 13, dir: 'RequestSmuggling', script: 'exploit-lab13.py' },
    { topic: 'RequestSmuggling', num: 14, dir: 'RequestSmuggling', script: 'exploit-lab14.py' },
    { topic: 'RequestSmuggling', num: 15, dir: 'RequestSmuggling', script: 'exploit-lab15.py' },
    { topic: 'RequestSmuggling', num: 16, dir: 'RequestSmuggling', script: 'exploit-lab16.py' },
    { topic: 'RequestSmuggling', num: 17, dir: 'RequestSmuggling', script: 'exploit-lab17.py' },
    { topic: 'RequestSmuggling', num: 18, dir: 'RequestSmuggling', script: 'exploit-lab18.py' },
    { topic: 'RequestSmuggling', num: 19, dir: 'RequestSmuggling', script: 'exploit-lab19.py' },
    { topic: 'RequestSmuggling', num: 20, dir: 'RequestSmuggling', script: 'exploit-lab20.py' },
    { topic: 'RequestSmuggling', num: 21, dir: 'RequestSmuggling', script: 'exploit-lab21.py' },
    { topic: 'RequestSmuggling', num: 22, dir: 'RequestSmuggling', script: 'exploit-lab22.py' },
    
    // Category 5: No Python solvers - will need custom handling
    // These will fail the Python solver step but we can add custom logic later
  ];

  let solved = 0;
  let failed = 0;
  let skipped = 0;

  for (const lab of labs) {
    try {
      const result = await runLab(page, ctx, lab, allLabs);
      if (result === true) solved++;
      else if (result === false) failed++;
      else skipped++;
    } catch (e) {
      console.log(`  Unexpected error: ${e.message?.slice(0, 200)}`);
      failed++;
    }
    
    // Long delay between labs
    console.log('  Waiting 45s before next lab...');
    await sleep(45000);
  }

  console.log(`\n========================================`);
  console.log(`Final Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================`);

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
