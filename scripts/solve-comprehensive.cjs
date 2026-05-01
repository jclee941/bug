#!/usr/bin/env node
/**
 * Comprehensive Batch Solver using actual lab hrefs
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

// Category to solver directory mapping
const CATEGORY_SOLVER_MAP = {
  'sql-injection': 'SQLInjection',
  'cross-site-scripting': 'XSS',
  'ssrf': 'SSRF',
  'request-smuggling': 'RequestSmuggling',
  'os-command-injection': 'OSCommandInjection',
  'authentication': 'Authentication',
  'websockets': null, // No solvers
  'web-cache-poisoning': 'WebCachePoisoning',
  'deserialization': null, // No solvers
  'logic-flaws': 'BusinessLogic',
  'host-header': 'HostHeader',
  'oauth': 'OAuth',
  'essential-skills': null, // No solvers
  'prototype-pollution': 'PrototypePollution',
  'race-conditions': null, // No solvers
  'nosql-injection': null, // No solvers
  'llm-attacks': null, // No solvers
  'web-cache-deception': null, // No solvers
};

// Special solver mappings (labNum -> solverNum)
const SPECIAL_MAPPINGS = {
  'oauth': {
    '3': '02', // Forced OAuth profile linking
    '5': '04', // Stealing OAuth access tokens via open redirect
  }
};

// Labs that need interactsh/collaborator
const COLLAB_LABS = [
  'sql-injection:17',
  'ssrf:6',
  'os-command-injection:4',
  'os-command-injection:5',
];

function getSolverPath(lab) {
  const solverDir = CATEGORY_SOLVER_MAP[lab.topic];
  if (!solverDir) return null;
  
  let solverNum = String(lab.topicIndex).padStart(2, '0');
  
  // Check special mappings
  if (SPECIAL_MAPPINGS[lab.topic] && SPECIAL_MAPPINGS[lab.topic][String(lab.topicIndex)]) {
    solverNum = SPECIAL_MAPPINGS[lab.topic][String(lab.topicIndex)];
  }
  
  const solverPath = path.join(SOLVER_BASE, solverDir, `exploit-lab${solverNum}.py`);
  return fs.existsSync(solverPath) ? solverPath : null;
}

function getExtraArgs(lab) {
  const key = `${lab.topic}:${lab.topicIndex}`;
  if (COLLAB_LABS.includes(key)) {
    return '--collab ' + INTERACTSH_DOMAIN;
  }
  return '';
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

async function launchLab(browser, page, href) {
  const fullUrl = 'https://portswigger.net' + href;
  console.log(`[*] Launching: ${href}`);
  
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  
  const accessBtn = await page.locator('a:has-text("ACCESS THE LAB")').first();
  if (await accessBtn.count() === 0) {
    console.log('  [!] No access button found');
    return null;
  }
  
  const beforeUrl = page.url();
  await accessBtn.click();
  await sleep(10000);
  
  const afterUrl = page.url();
  if (!afterUrl.includes('portswigger.net') && afterUrl !== 'about:blank') {
    return { url: afterUrl, page };
  }
  
  const pages = browser.contexts()[0].pages();
  for (const p of pages) {
    const url = p.url();
    if (url && url !== 'about:blank' && !url.includes('portswigger.net') && url !== beforeUrl) {
      return { url, page: p };
    }
  }
  
  return null;
}

async function verifyLab(page, baseUrl) {
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    const body = await page.content();
    return body.toLowerCase().includes('congratulations');
  } catch (e) {
    return false;
  }
}

function runSolver(solverPath, labUrl, extraArgs) {
  const content = fs.readFileSync(solverPath, 'utf8');
  if (content.includes('WIP') || content.trim().split('\n').length < 10) {
    console.log('  [!] Solver is incomplete/stub');
    return false;
  }
  
  const cmd = `python3 -u "${solverPath}" -U "${labUrl}" ${extraArgs}`;
  console.log(`  [*] Running solver...`);
  
  try {
    const output = execSync(cmd, {
      timeout: 120000,
      encoding: 'utf-8',
      cwd: path.dirname(solverPath),
    });
    console.log(output.substring(0, 1500));
    return output.toLowerCase().includes('solved') || output.toLowerCase().includes('congratulations');
  } catch (e) {
    console.log(`  [!] Solver error: ${e.message?.substring(0, 200)}`);
    if (e.stdout) console.log(e.stdout.toString().substring(0, 1000));
    if (e.stderr) console.log(e.stderr.toString().substring(0, 1000));
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
  let skipped = 0;
  
  for (const lab of labs) {
    const solverPath = getSolverPath(lab);
    
    console.log(`\n=== ${lab.topic} #${lab.topicIndex}: ${lab.title} ===`);
    
    if (!solverPath) {
      console.log('  [-] No Python solver available');
      skipped++;
      continue;
    }
    
    const result = await launchLab(browser, page, lab.href);
    if (!result) {
      console.log('  [!] Failed to launch lab');
      failed++;
      continue;
    }
    
    await sleep(3000);
    
    const extraArgs = getExtraArgs(lab);
    const success = runSolver(solverPath, result.url, extraArgs);
    
    if (success) {
      console.log('  [+] SOLVED!');
      solved++;
    } else {
      await sleep(3000);
      const isSolved = await verifyLab(result.page || page, result.url);
      if (isSolved) {
        console.log('  [+] SOLVED! (verified)');
        solved++;
      } else {
        console.log('  [-] FAILED');
        failed++;
      }
    }
    
    await sleep(5000);
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Solved: ${solved}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped (no solver): ${skipped}`);
  console.log(`Total: ${labs.length}`);
  
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
