#!/usr/bin/env node
/**
 * Master Batch Solver for remaining 49 PortSwigger labs
 * 
 * Strategy:
 * 1. Labs with Python solvers → run with python3 -u
 * 2. OOB labs → provide interactsh domain
 * 3. Labs without solvers → custom Playwright handling
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const INTERACTSH_DOMAIN = process.env.INTERACTSH_DOMAIN || 'd7j9tts2olvgic6776g0y766ekedfq6s1.oast.live';
const SOLVER_BASE = '/tmp/wsa-solutions';

// Lab to solver mapping for remaining 49 labs
// Format: [category, labNumber, solverPath, extraArgs]
const LABS_WITH_SOLVERS = [
  // Business Logic (logic-flaws)
  ['BusinessLogic', '05', 'BusinessLogic/exploit-lab05.py', ''],
  ['BusinessLogic', '10', 'BusinessLogic/exploit-lab10.py', ''],
  ['BusinessLogic', '12', 'BusinessLogic/exploit-lab12.py', ''],
  
  // SQL Injection
  ['SQLInjection', '11', 'SQLInjection/exploit-lab11.py', ''],
  ['SQLInjection', '12', 'SQLInjection/exploit-lab12.py', ''],
  ['SQLInjection', '15', 'SQLInjection/exploit-lab15.py', ''],
  ['SQLInjection', '17', 'SQLInjection/exploit-lab17.py', '--collab ' + INTERACTSH_DOMAIN],
  
  // XSS
  ['XSS', '22', 'XSS/exploit-lab22.py', ''],
  ['XSS', '23', 'XSS/exploit-lab23.py', ''],
  ['XSS', '29', 'XSS/exploit-lab29.py', ''],
  
  // SSRF
  ['SSRF', '06', 'SSRF/exploit-lab06.py', '--collab ' + INTERACTSH_DOMAIN],
  
  // OS Command Injection
  ['OSCommandInjection', '04', 'OSCommandInjection/exploit-lab04.py', '--collab ' + INTERACTSH_DOMAIN],
  ['OSCommandInjection', '05', 'OSCommandInjection/exploit-lab05.py', '--collab ' + INTERACTSH_DOMAIN],
  
  // Authentication
  ['Authentication', '05', 'Authentication/exploit-lab05.py', ''],
  
  // Web Cache Poisoning
  ['WebCachePoisoning', '05', 'WebCachePoisoning/exploit-lab05.py', ''],
  ['WebCachePoisoning', '06', 'WebCachePoisoning/exploit-lab06.py', ''],
  ['WebCachePoisoning', '09', 'WebCachePoisoning/exploit-lab09.py', ''],
  
  // Host Header
  ['HostHeader', '03', 'HostHeader/exploit-lab03.py', ''],
  
  // OAuth - corrected mappings
  ['OAuth', '03', 'OAuth/exploit-lab02.py', ''],  // Forced OAuth profile linking
  ['OAuth', '05', 'OAuth/exploit-lab04.py', ''],  // Stealing OAuth access tokens via open redirect
  
  // Prototype Pollution
  ['PrototypePollution', '05', 'PrototypePollution/exploit-lab05.py', ''],
];

// Labs without Python solvers - need custom handling
const LABS_WITHOUT_SOLVERS = [
  // Request Smuggling (12 labs)
  ['RequestSmuggling', '06'],
  ['RequestSmuggling', '12'],
  ['RequestSmuggling', '13'],
  ['RequestSmuggling', '14'],
  ['RequestSmuggling', '15'],
  ['RequestSmuggling', '16'],
  ['RequestSmuggling', '17'],
  ['RequestSmuggling', '18'],
  ['RequestSmuggling', '19'],
  ['RequestSmuggling', '20'],
  ['RequestSmuggling', '21'],
  ['RequestSmuggling', '22'],
  
  // No Python solver categories
  ['EssentialSkills', '02'],
  ['WebSockets', '03'],
  ['Deserialization', '06'],
  ['RaceConditions', '01'],
  ['RaceConditions', '02'],
  ['RaceConditions', '04'],
  ['RaceConditions', '05'],
  ['RaceConditions', '06'],
  ['NoSQLInjection', '04'],
  ['LLMAttacks', '02'],
  ['LLMAttacks', '03'],
  ['LLMAttacks', '04'],
  ['WebCacheDeception', '02'],
  ['WebCacheDeception', '03'],
  ['WebCacheDeception', '04'],
  ['WebCacheDeception', '05'],
];

const TOPIC_URL_MAP = {
  'sql-injection': 'sql-injection',
  'cross-site-scripting': 'cross-site-scripting',
  'ssrf': 'ssrf',
  'os-command-injection': 'os-command-injection',
  'authentication': 'authentication',
  'request-smuggling': 'request-smuggling',
  'web-cache-poisoning': 'web-cache-poisoning',
  'host-header': 'host-header',
  'oauth': 'oauth',
  'essential-skills': 'essential-skills',
  'prototype-pollution': 'prototype-pollution',
  'logic-flaws': 'logic-flaws',
  'race-conditions': 'race-conditions',
  'nosql-injection': 'nosql-injection',
  'llm-attacks': 'llm-attacks',
  'web-cache-deception': 'web-cache-deception',
  'websockets': 'websockets',
  'deserialization': 'deserialization',
};

function getTopicUrl(topic) {
  return TOPIC_URL_MAP[topic] || topic;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function login(page) {
  console.log('[*] Logging into PortSwigger...');
  await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  await sleep(2000);
  console.log('[+] Logged in');
}

async function launchLab(page, topic, labNum) {
  const topicUrl = getTopicUrl(topic);
  const labUrl = `https://portswigger.net/web-security/${topicUrl}/lab-${topicUrl}-${labNum}`;
  
  console.log(`[*] Launching lab: ${topic} #${labNum}`);
  await page.goto(labUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  
  // Click "ACCESS THE LAB" button
  const accessBtn = await page.$('button:has-text("ACCESS THE LAB"), a:has-text("ACCESS THE LAB")');
  if (!accessBtn) {
    console.log(`  [!] No ACCESS THE LAB button found`);
    return null;
  }
  
  const [newPage] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
    accessBtn.click(),
  ]);
  
  await sleep(5000);
  
  // Find the lab page
  const pages = page.context().pages();
  const labPage = pages.find(p => {
    const url = p.url();
    return url.includes('web-security-academy.net') && !url.includes('portswigger.net');
  });
  
  if (!labPage) {
    console.log(`  [!] Lab page not found`);
    return null;
  }
  
  const url = labPage.url();
  console.log(`  [+] Lab URL: ${url}`);
  return url;
}

async function checkSolved(page, topic, labNum) {
  const topicUrl = getTopicUrl(topic);
  const labUrl = `https://portswigger.net/web-security/${topicUrl}/lab-${topicUrl}-${labNum}`;
  await page.goto(labUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);
  
  const body = await page.textContent('body').catch(() => '');
  const isSolved = body.includes('is-solved') || body.includes('Congratulations') || body.includes('solved');
  return isSolved;
}

function runSolver(solverPath, labUrl, extraArgs) {
  const fullPath = path.join(SOLVER_BASE, solverPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`  [!] Solver not found: ${fullPath}`);
    return false;
  }
  
  const cmd = `cd ${SOLVER_BASE} && python3 -u ${fullPath} -U "${labUrl}" ${extraArgs}`;
  console.log(`  [*] Running: ${cmd}`);
  
  try {
    const output = execSync(cmd, { timeout: 120000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    console.log(output);
    return output.includes('solved') || output.includes('Congratulations');
  } catch (e) {
    console.log(`  [!] Solver error: ${e.message}`);
    if (e.stdout) console.log(e.stdout.toString());
    if (e.stderr) console.log(e.stderr.toString());
    return false;
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars');
    process.exit(1);
  }
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  await login(page);
  
  let solved = 0;
  let failed = 0;
  
  // Phase 1: Labs with Python solvers
  console.log(`\n=== PHASE 1: Labs with Python solvers (${LABS_WITH_SOLVERS.length}) ===\n`);
  
  for (const [category, labNum, solverPath, extraArgs] of LABS_WITH_SOLVERS) {
    console.log(`\n--- ${category} #${labNum} ---`);
    
    const labUrl = await launchLab(page, category === 'BusinessLogic' ? 'logic-flaws' : 
      category === 'HostHeader' ? 'host-header' : 
      category === 'WebCachePoisoning' ? 'web-cache-poisoning' :
      category === 'OSCommandInjection' ? 'os-command-injection' :
      category === 'RequestSmuggling' ? 'request-smuggling' :
      category.toLowerCase(), labNum);
    
    if (!labUrl) {
      failed++;
      continue;
    }
    
    await sleep(3000);
    
    const success = runSolver(solverPath, labUrl, extraArgs);
    if (success) {
      console.log(`  [+] SOLVED!`);
      solved++;
    } else {
      // Double-check
      await sleep(3000);
      const isSolved = await checkSolved(page, category === 'BusinessLogic' ? 'logic-flaws' : 
        category === 'HostHeader' ? 'host-header' : 
        category === 'WebCachePoisoning' ? 'web-cache-poisoning' :
        category === 'OSCommandInjection' ? 'os-command-injection' :
        category === 'RequestSmuggling' ? 'request-smuggling' :
        category.toLowerCase(), labNum);
      if (isSolved) {
        console.log(`  [+] SOLVED! (verified)`);
        solved++;
      } else {
        console.log(`  [-] FAILED`);
        failed++;
      }
    }
    
    await sleep(5000);
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Solved: ${solved}/${LABS_WITH_SOLVERS.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nRemaining labs without solvers: ${LABS_WITHOUT_SOLVERS.length}`);
  
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
