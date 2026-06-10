#!/usr/bin/env node
/**
 * Systematic Lab Solver - solves remaining labs one by one
 * Uses requests-wrapper.py to add delays and avoid rate limiting
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const INTERACTSH_DOMAIN = process.env.INTERACTSH_DOMAIN || 'd7j9tts2olvgic6776g0y766ekedfq6s1.oast.live';
const SOLVER_BASE = '/tmp/wsa-solutions';

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
    return false;
  }
  
  const content = fs.readFileSync(solverPath, 'utf8');
  if (content.includes('WIP') || content.trim().split('\n').length < 10) {
    console.log(`  [-] Incomplete solver for ${lab.topic} #${lab.topicIndex}`);
    return false;
  }
  
  console.log(`\n=== Solving: ${lab.topic} #${lab.topicIndex}: ${lab.title} ===`);
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
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
    console.log(`[*] Launching lab...`);
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    
    const accessBtn = await page.locator('a:has-text("ACCESS THE LAB")').first();
    if (await accessBtn.count() === 0) {
      console.log('[!] No access button');
      return false;
    }
    
    await accessBtn.click();
    console.log('[*] Waiting 45s for lab to initialize...');
    await sleep(45000);
    
    // Get lab URL
    const pages = browser.contexts()[0].pages();
    let labUrl = null;
    for (const p of pages) {
      const url = p.url();
      if (url.includes('web-security-academy.net')) {
        labUrl = url;
        break;
      }
    }
    
    if (!labUrl) {
      console.log('[!] Lab URL not found');
      return false;
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
      return true;
    }
    
    // Verify by checking lab page
    console.log('[*] Verifying...');
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    const html = await page.content();
    const isSolved = html.includes('is-solved') || html.includes('Congratulations');
    
    if (isSolved) {
      console.log('[+] SOLVED! (verified)');
      return true;
    } else {
      console.log('[-] NOT SOLVED');
      return false;
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD');
    process.exit(1);
  }
  
  let solved = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const lab of labs) {
    const solverPath = getSolverPath(lab);
    if (!solverPath) {
      skipped++;
      continue;
    }
    
    const success = await solveLab(lab);
    if (success) {
      solved++;
    } else {
      failed++;
    }
    
    // Wait between labs to avoid rate limiting
    console.log('[*] Waiting 30s before next lab...');
    await sleep(30000);
  }
  
  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Solved: ${solved}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped (no solver): ${skipped}`);
  console.log(`Total remaining: ${labs.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
