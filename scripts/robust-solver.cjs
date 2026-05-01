#!/usr/bin/env node
/**
 * Robust Batch Solver for PortSwigger labs
 * Processes labs one by one with fresh instances
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const INTERACTSH_DOMAIN = process.env.INTERACTSH_DOMAIN || 'd7j9tts2olvgic6776g0y766ekedfq6s1.oast.live';
const SOLVER_BASE = '/tmp/wsa-solutions';
const PROGRESS_FILE = '/tmp/solver-progress.json';

const labs = JSON.parse(fs.readFileSync('/tmp/remaining-labs.json', 'utf8'));

const CATEGORY_SOLVER_MAP = {
  'sql-injection': 'SQLInjection',
  'cross-site-scripting': 'XSS',
  'ssrf': 'SSRF',
  'request-smuggling': 'RequestSmuggling',
  'os-command-injection': 'OSCommandInjection',
  'authentication': 'Authentication',
  'websockets': null,
  'web-cache-poisoning': 'WebCachePoisoning',
  'deserialization': null,
  'logic-flaws': 'BusinessLogic',
  'host-header': 'HostHeader',
  'oauth': 'OAuth',
  'essential-skills': null,
  'prototype-pollution': 'PrototypePollution',
  'race-conditions': null,
  'nosql-injection': null,
  'llm-attacks': null,
  'web-cache-deception': null,
};

const SPECIAL_MAPPINGS = {
  'oauth': { '3': '02', '5': '04' }
};

const COLLAB_LABS = [
  'sql-injection:17', 'ssrf:6',
  'os-command-injection:4', 'os-command-injection:5',
];

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { solved: [], failed: [], skipped: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function getSolverPath(lab) {
  const solverDir = CATEGORY_SOLVER_MAP[lab.topic];
  if (!solverDir) return null;
  let solverNum = String(lab.topicIndex).padStart(2, '0');
  if (SPECIAL_MAPPINGS[lab.topic]?.[String(lab.topicIndex)]) {
    solverNum = SPECIAL_MAPPINGS[lab.topic][String(lab.topicIndex)];
  }
  const solverPath = path.join(SOLVER_BASE, solverDir, `exploit-lab${solverNum}.py`);
  return fs.existsSync(solverPath) ? solverPath : null;
}

function getExtraArgs(lab) {
  const key = `${lab.topic}:${lab.topicIndex}`;
  return COLLAB_LABS.includes(key) ? '--collab ' + INTERACTSH_DOMAIN : '';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function solveLab(lab) {
  const solverPath = getSolverPath(lab);
  if (!solverPath) {
    console.log(`  [-] No solver for ${lab.topic} #${lab.topicIndex}`);
    return 'skipped';
  }
  
  const content = fs.readFileSync(solverPath, 'utf8');
  if (content.includes('WIP') || content.trim().split('\n').length < 10) {
    console.log(`  [-] Incomplete solver for ${lab.topic} #${lab.topicIndex}`);
    return 'skipped';
  }
  
  console.log(`\n=== ${lab.topic} #${lab.topicIndex}: ${lab.title} ===`);
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  let labUrl = null;
  let labPage = null;
  
  try {
    // Login
    console.log('[*] Logging in...');
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await sleep(2000);
    
    // Launch lab
    const fullUrl = 'https://portswigger.net' + lab.href;
    console.log('[*] Launching lab...');
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    
    const accessBtn = await page.locator('a:has-text("ACCESS THE LAB")').first();
    if (await accessBtn.count() === 0) {
      console.log('[!] No access button');
      return 'failed';
    }
    
    await accessBtn.click();
    console.log('[*] Waiting 50s for lab to initialize...');
    await sleep(50000);
    
    // Get lab URL
    const allPages = browser.contexts()[0].pages();
    for (const p of allPages) {
      const url = p.url();
      if (url.includes('web-security-academy.net')) {
        labUrl = url;
        labPage = p;
        break;
      }
    }
    
    if (!labUrl) {
      console.log('[!] Lab URL not found');
      return 'failed';
    }
    
    console.log(`[+] Lab URL: ${labUrl}`);
    await sleep(5000);
    
    // Run solver with wrapper
    const extraArgs = getExtraArgs(lab);
    const cmd = `python3 ${SOLVER_BASE}/requests-wrapper.py "${solverPath}" -U "${labUrl}" ${extraArgs}`;
    console.log('[*] Running solver...');
    
    let output = '';
    try {
      output = execSync(cmd, {
        timeout: 600000,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
      });
      console.log(output.substring(0, 2000));
    } catch (e) {
      console.log(`[!] Solver error: ${e.message?.substring(0, 200)}`);
      if (e.stdout) {
        output = e.stdout.toString();
        console.log(output.substring(0, 1500));
      }
      if (e.stderr) console.log(e.stderr.toString().substring(0, 1000));
    }
    
    const solverSolved = output.toLowerCase().includes('solved') || output.toLowerCase().includes('congratulations');
    
    if (solverSolved) {
      console.log('[+] SOLVED!');
      return 'solved';
    }
    
    // Verify by checking lab page
    console.log('[*] Verifying...');
    await sleep(3000);
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    const html = await page.content();
    const isSolved = html.includes('is-solved') || html.includes('Congratulations');
    
    if (isSolved) {
      console.log('[+] SOLVED! (verified)');
      return 'solved';
    } else {
      console.log('[-] NOT SOLVED');
      return 'failed';
    }
  } catch (e) {
    console.log(`[!] Error: ${e.message}`);
    return 'failed';
  } finally {
    try {
      await ctx.close();
      await browser.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD');
    process.exit(1);
  }
  
  const progress = loadProgress();
  
  for (const lab of labs) {
    const labId = `${lab.topic}-${lab.topicIndex}`;
    
    // Skip already processed labs
    if (progress.solved.includes(labId) || progress.failed.includes(labId) || progress.skipped.includes(labId)) {
      console.log(`Skipping already processed: ${lab.topic} #${lab.topicIndex}`);
      continue;
    }
    
    const result = await solveLab(lab);
    progress[result].push(labId);
    saveProgress(progress);
    
    console.log(`\n[*] Progress: ${progress.solved.length} solved, ${progress.failed.length} failed, ${progress.skipped.length} skipped / ${labs.length} total`);
    
    // Wait between labs
    if (result === 'solved') {
      console.log('[*] Waiting 15s before next lab...');
      await sleep(15000);
    } else {
      console.log('[*] Waiting 30s before next lab...');
      await sleep(30000);
    }
  }
  
  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Solved: ${progress.solved.length}`);
  console.log(`Failed: ${progress.failed.length}`);
  console.log(`Skipped: ${progress.skipped.length}`);
  console.log(`Total: ${labs.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
