#!/usr/bin/env node
/**
 * Single Lab Solver - solves one lab at a time with fresh browser
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const INTERACTSH_DOMAIN = process.env.INTERACTSH_DOMAIN || 'd7j9tts2olvgic6776g0y766ekedfq6s1.oast.live';
const SOLVER_BASE = '/tmp/wsa-solutions';

const labHref = process.argv[2];
const solverPath = process.argv[3];
const extraArgs = process.argv[4] || '';

if (!labHref || !solverPath) {
  console.error('Usage: node single-lab-solver.cjs <lab-href> <solver-path> [extra-args]');
  console.error('Example: node single-lab-solver.cjs /web-security/authentication/password-based/lab-username-enumeration-via-response-timing Authentication/exploit-lab05.py');
  process.exit(1);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function login(page) {
  console.log('[*] Logging in...');
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
  console.log(`[*] Launching lab: ${href}`);
  
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  
  const accessBtn = await page.locator('a:has-text("ACCESS THE LAB")').first();
  if (await accessBtn.count() === 0) {
    console.log('[!] No access button');
    return null;
  }
  
  const beforeUrl = page.url();
  await accessBtn.click();
  
  // Wait for lab to initialize
  console.log('[*] Waiting 45s for lab to initialize...');
  await sleep(45000);
  
  // Check all pages for lab URL
  const pages = browser.contexts()[0].pages();
  for (const p of pages) {
    const url = p.url();
    if (url.includes('web-security-academy.net')) {
      console.log(`[+] Lab URL: ${url}`);
      return { url, page: p };
    }
  }
  
  console.log('[!] Lab page not found');
  return null;
}

function runSolver(fullSolverPath, labUrl, extraArgs) {
  if (!fs.existsSync(fullSolverPath)) {
    console.log(`[!] Solver not found: ${fullSolverPath}`);
    return false;
  }
  
  const content = fs.readFileSync(fullSolverPath, 'utf8');
  if (content.includes('WIP') || content.trim().split('\n').length < 10) {
    console.log('[!] Solver is incomplete/stub');
    return false;
  }
  
  const cmd = `python3 -u "${fullSolverPath}" -U "${labUrl}" ${extraArgs}`;
  console.log(`[*] Running: ${path.basename(fullSolverPath)}`);
  
  try {
    const output = execSync(cmd, {
      timeout: 300000,
      encoding: 'utf-8',
      cwd: path.dirname(fullSolverPath),
    });
    console.log(output.substring(0, 2000));
    return output.toLowerCase().includes('solved') || output.toLowerCase().includes('congratulations');
  } catch (e) {
    console.log(`[!] Error: ${e.message?.substring(0, 200)}`);
    if (e.stdout) console.log(e.stdout.toString().substring(0, 1500));
    if (e.stderr) console.log(e.stderr.toString().substring(0, 1000));
    return false;
  }
}

async function verifyLab(page, labUrl) {
  try {
    await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    const body = await page.content();
    return body.toLowerCase().includes('congratulations');
  } catch (e) {
    return false;
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD');
    process.exit(1);
  }
  
  const fullSolverPath = path.join(SOLVER_BASE, solverPath);
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    await login(page);
    
    const result = await launchLab(browser, page, labHref);
    if (!result) {
      console.log('[-] Failed to launch lab');
      process.exit(1);
    }
    
    await sleep(5000);
    
    const success = runSolver(fullSolverPath, result.url, extraArgs);
    
    if (success) {
      console.log('[+] SOLVED!');
    } else {
      await sleep(3000);
      const isSolved = await verifyLab(result.page || page, result.url);
      if (isSolved) {
        console.log('[+] SOLVED! (verified)');
      } else {
        console.log('[-] NOT SOLVED');
      }
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
