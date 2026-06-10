const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

const TOPIC_DIRS = {
  'sql-injection': 'SQLInjection',
  'cross-site-scripting': 'XSS',
  'ssrf': 'SSRF',
  'request-smuggling': 'RequestSmuggling',
  'os-command-injection': 'OSCommandInjection',
  'authentication': 'Authentication',
  'websockets': 'Websockets',
  'web-cache-poisoning': 'WebCachePoisoning',
  'deserialization': 'InsecureDeserialization',
  'logic-flaws': 'BusinessLogic',
  'host-header': 'HostHeader',
  'oauth': 'OAuth',
  'essential-skills': 'EssentialSkills',
  'prototype-pollution': 'PrototypePollution',
  'nosql-injection': 'NoSQL',
};

// Topics with no Python solvers at all
const NO_SOLVER_TOPICS = ['race-conditions', 'llm-attacks', 'web-cache-deception'];

// Extended timeouts for slow labs
const EXTENDED_TIMEOUTS = {
  'sql-injection': 600000,
  'authentication': 600000,
  'request-smuggling': 300000,
  'deserialization': 300000,
};

async function getUnsolvedLabs(browser) {
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
    
    const labs = await page.evaluate(() => {
      const results = [];
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      const topicCounts = {};
      
      links.forEach((el) => {
        const a = el.querySelector('a');
        if (!a) return;
        
        const href = a.getAttribute('href') || '';
        const title = a.textContent?.trim() || '';
        const isSolved = el.className.includes('is-solved');
        
        const match = href.match(/\/web-security\/([^/]+)/);
        const topic = match ? match[1] : '';
        
        if (!topic) return;
        
        if (!topicCounts[topic]) topicCounts[topic] = 0;
        topicCounts[topic]++;
        
        if (!isSolved) {
          results.push({ topic, title, href, topicIndex: topicCounts[topic] });
        }
      });
      
      return results;
    });
    
    await ctx.close();
    return labs;
  } catch (e) {
    console.error('Error getting labs:', e.message);
    await ctx.close();
    return [];
  }
}

async function solveLab(browser, lab) {
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
    
    await page.goto('https://portswigger.net' + lab.href, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) { console.log('  No launch link'); await ctx.close(); return false; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const labUrl = page.url();
    if (!labUrl.includes('web-security-academy.net')) {
      console.log('  Lab did not load');
      await ctx.close();
      return false;
    }
    
    const base = new URL(labUrl).origin;
    console.log(`  Lab URL: ${base}`);
    
    const dir = TOPIC_DIRS[lab.topic];
    if (!dir) {
      console.log(`  No solver directory for topic: ${lab.topic}`);
      await ctx.close();
      return false;
    }
    
    const solverPath = `/tmp/wsa-solutions/${dir}/exploit-lab${String(lab.topicIndex).padStart(2, '0')}.py`;
    
    if (!existsSync(solverPath)) {
      console.log(`  Solver not found: ${solverPath}`);
      await ctx.close();
      return false;
    }
    
    const timeout = EXTENDED_TIMEOUTS[lab.topic] || 300000;
    
    try {
      const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
        timeout: timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: `/tmp/wsa-solutions/${dir}`,
      });
      console.log(output.split('\n').slice(0, 20).map(l => '    ' + l).join('\n'));
    } catch (e) {
      console.log('  Output:', (e.stdout || '').split('\n').slice(0, 15).map(l => '    ' + l).join('\n'));
      console.log('  Stderr:', (e.stderr || '').split('\n').slice(0, 5).map(l => '    ' + l).join('\n'));
    }
    
    await page.waitForTimeout(3000);
    const verifyPage = await ctx.newPage();
    await verifyPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await verifyPage.textContent('body').catch(() => '');
    await verifyPage.close();
    
    const solved = body?.toLowerCase().includes('congratulations');
    console.log(solved ? '  SOLVED!' : '  Not solved');
    
    await ctx.close();
    return solved;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    await ctx.close();
    return false;
  }
}

async function main() {
  console.log('\n  PortSwigger Master Solver - All Remaining Labs\n');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  console.log('Fetching unsolved labs...');
  const unsolvedLabs = await getUnsolvedLabs(browser);
  console.log(`Found ${unsolvedLabs.length} unsolved labs\n`);
  
  const byTopic = {};
  unsolvedLabs.forEach(lab => {
    if (!byTopic[lab.topic]) byTopic[lab.topic] = [];
    byTopic[lab.topic].push(lab);
  });
  
  let solved = 0, failed = 0, skipped = 0;
  
  for (const [topic, labs] of Object.entries(byTopic)) {
    if (NO_SOLVER_TOPICS.includes(topic)) {
      console.log(`\n[${topic}] ${labs.length} labs - NO PYTHON SOLVERS, skipping`);
      skipped += labs.length;
      continue;
    }
    
    console.log(`\n[${topic}] ${labs.length} labs`);
    
    for (const lab of labs) {
      console.log(`\n[${topic}#${lab.topicIndex}] ${lab.title}`);
      const result = await solveLab(browser, lab);
      if (result === true) solved++;
      else if (result === false) failed++;
      else skipped++;
      
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`Total remaining before: ${unsolvedLabs.length}`);
  console.log(`Total remaining after: ${failed + skipped}`);
  console.log(`========================================\n`);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
