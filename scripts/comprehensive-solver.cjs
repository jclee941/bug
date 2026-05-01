const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

// Topic → solver directory mapping
const TOPIC_DIRS = {
  'sql-injection': 'SQLInjection',
  'cross-site-scripting': 'XSS',
  'clickjacking': 'ClickJacking',
  'xxe': 'XXE',
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
  'jwt': 'JWT',
  'essential-skills': 'EssentialSkills',
  'prototype-pollution': 'PrototypePollution',
  'nosql-injection': 'NoSQL',
};

// Labs without Python solvers (will be skipped or handled separately)
const NO_SOLVER_TOPICS = ['race-conditions', 'llm-attacks', 'web-cache-deception'];

async function getUnsolvedLabs(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    // Login
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await page.waitForTimeout(2000);
    
    // Get all labs
    await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const labs = await page.evaluate(() => {
      const results = [];
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      
      // Track topic-specific indices
      const topicCounts = {};
      
      links.forEach((el) => {
        const a = el.querySelector('a');
        if (!a) return;
        
        const href = a.getAttribute('href') || '';
        const title = a.textContent?.trim() || '';
        const isSolved = el.className.includes('is-solved');
        
        // Extract topic from href
        const match = href.match(/\/web-security\/([^/]+)/);
        const topic = match ? match[1] : '';
        
        if (!topic) return;
        
        // Increment topic count
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
    // Login
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await page.waitForTimeout(2000);
    
    // Launch lab
    await page.goto('https://portswigger.net' + lab.href, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) { console.log('  ❌ No launch link'); await ctx.close(); return false; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const labUrl = page.url();
    if (!labUrl.includes('web-security-academy.net')) {
      console.log('  ❌ Lab did not load');
      await ctx.close();
      return false;
    }
    
    const base = new URL(labUrl).origin;
    console.log(`  Lab URL: ${base}`);
    
    // Find solver
    const dir = TOPIC_DIRS[lab.topic];
    if (!dir) {
      console.log(`  ❌ No solver directory for topic: ${lab.topic}`);
      await ctx.close();
      return false;
    }
    
    // The solver scripts are numbered by topic-specific lab number
    const solverPath = `/tmp/wsa-solutions/${dir}/exploit-lab${String(lab.topicIndex).padStart(2, '0')}.py`;
    
    if (!existsSync(solverPath)) {
      console.log(`  ❌ Solver not found: ${solverPath}`);
      await ctx.close();
      return false;
    }
    
    console.log(`  Running: ${solverPath}`);
    
    try {
      const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
        timeout: 300000, // 5 min max
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(output.split('\n').slice(0, 20).map(l => '    ' + l).join('\n'));
    } catch (e) {
      console.log('  Output:', (e.stdout || '').split('\n').slice(0, 15).map(l => '    ' + l).join('\n'));
      console.log('  Stderr:', (e.stderr || '').split('\n').slice(0, 5).map(l => '    ' + l).join('\n'));
    }
    
    // Verify
    await page.waitForTimeout(3000);
    const verifyPage = await ctx.newPage();
    await verifyPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await verifyPage.textContent('body').catch(() => '');
    await verifyPage.close();
    
    const solved = body?.toLowerCase().includes('congratulations');
    console.log(solved ? '  🎯 SOLVED!' : '  ⬜ Not solved');
    
    await ctx.close();
    return solved;
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
    await ctx.close();
    return false;
  }
}

async function main() {
  console.log('\n  ┌─────────────────────────────────────────┐');
  console.log('  │   PortSwigger Comprehensive Solver      │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  // Get all unsolved labs
  console.log('Fetching unsolved labs from PortSwigger...');
  const unsolvedLabs = await getUnsolvedLabs(browser);
  console.log(`Found ${unsolvedLabs.length} unsolved labs\n`);
  
  // Group by topic
  const byTopic = {};
  unsolvedLabs.forEach(lab => {
    if (!byTopic[lab.topic]) byTopic[lab.topic] = [];
    byTopic[lab.topic].push(lab);
  });
  
  let solved = 0, failed = 0, skipped = 0;
  
  for (const [topic, labs] of Object.entries(byTopic)) {
    if (NO_SOLVER_TOPICS.includes(topic)) {
      console.log(`\n[${topic}] ${labs.length} labs - NO SOLVERS AVAILABLE, skipping`);
      skipped += labs.length;
      continue;
    }
    
    console.log(`\n[${topic}] ${labs.length} labs to solve`);
    
    for (const lab of labs) {
      console.log(`\n[${topic}#${lab.topicIndex}] ${lab.title}`);
      const result = await solveLab(browser, lab);
      if (result === true) solved++;
      else if (result === false) failed++;
      else skipped++;
      
      // Wait between labs
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================\n`);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
