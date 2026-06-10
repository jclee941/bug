const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const { existsSync } = require('fs');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

// Labs that need interactsh collaborator
const OOB_LABS = [
  { topic: 'sql-injection', num: 17, dir: 'SQLInjection', script: 'exploit-lab17.py', title: 'Blind SQL injection with out-of-band data exfiltration' },
  { topic: 'cross-site-scripting', num: 22, dir: 'XSS', script: 'exploit-lab22.py', title: 'Exploiting XSS to steal cookies' },
  { topic: 'cross-site-scripting', num: 23, dir: 'XSS', script: 'exploit-lab23.py', title: 'Exploiting XSS to capture passwords' },
  { topic: 'cross-site-scripting', num: 29, dir: 'XSS', script: 'exploit-lab29.py', title: 'Reflected XSS protected by very strict CSP, with dangling markup' },
  { topic: 'ssrf', num: 6, dir: 'SSRF', script: 'exploit-lab06.py', title: 'Blind SSRF with Shellshock exploitation' },
  { topic: 'os-command-injection', num: 4, dir: 'OSCommandInjection', script: 'exploit-lab04.py', title: 'Blind OS command injection with out-of-band interaction' },
  { topic: 'os-command-injection', num: 5, dir: 'OSCommandInjection', script: 'exploit-lab05.py', title: 'Blind OS command injection with out-of-band data exfiltration' },
];

async function getInteractshDomain() {
  console.log('Starting interactsh-client...');
  
  return new Promise((resolve, reject) => {
    const client = spawn('interactsh-client', ['-ps'], {
      timeout: 30000,
    });
    
    let output = '';
    let domain = null;
    
    client.stdout.on('data', (data) => {
      output += data.toString();
      // Look for domain pattern like: [INF] Listing 1 payload for OOB testing
      // [INF] c59e4kjiirb8kg9onj6g5h7ob6oyyyyyn.oast.fun
      const match = output.match(/([a-z0-9]+\.oast\.[a-z0-9]+)/);
      if (match && !domain) {
        domain = match[1];
        console.log('Got interactsh domain:', domain);
        resolve({ domain, client });
      }
    });
    
    client.stderr.on('data', (data) => {
      output += data.toString();
      const match = output.match(/([a-z0-9]+\.oast\.[a-z0-9]+)/);
      if (match && !domain) {
        domain = match[1];
        console.log('Got interactsh domain:', domain);
        resolve({ domain, client });
      }
    });
    
    client.on('error', (err) => {
      reject(err);
    });
    
    client.on('exit', (code) => {
      if (!domain) {
        reject(new Error('interactsh-client exited without providing domain'));
      }
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
      if (!domain) {
        client.kill();
        reject(new Error('Timeout waiting for interactsh domain'));
      }
    }, 15000);
  });
}

async function solveLab(browser, lab, collabDomain) {
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
    
    // Find lab
    await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const labLink = await page.evaluate(({ topic, num }) => {
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      const topicLinks = links.filter(el => {
        const a = el.querySelector('a');
        return a?.getAttribute('href')?.includes(`/web-security/${topic}/`);
      });
      const target = topicLinks[num - 1];
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    }, { topic: lab.topic, num: lab.num });
    
    if (labLink === 'SOLVED') {
      console.log('  ✅ Already solved');
      await ctx.close();
      return true;
    }
    if (!labLink) {
      console.log('  ❌ Lab not found');
      await ctx.close();
      return false;
    }
    
    // Launch lab
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
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
    
    // Run solver with collaborator
    const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;
    if (!existsSync(solverPath)) {
      console.log(`  ❌ Solver not found: ${solverPath}`);
      await ctx.close();
      return false;
    }
    
    try {
      const output = execSync(`python3 "${solverPath}" -U "${base}" -C "${collabDomain}"`, {
        timeout: 300000,
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
  console.log('  │   PortSwigger OOB Lab Solver            │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  // Start interactsh
  let interactshClient;
  let collabDomain;
  
  try {
    const result = await getInteractshDomain();
    collabDomain = result.domain;
    interactshClient = result.client;
  } catch (e) {
    console.error('Failed to start interactsh:', e.message);
    process.exit(1);
  }
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0, skipped = 0;
  
  for (const lab of OOB_LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    const result = await solveLab(browser, lab, collabDomain);
    if (result === true) solved++;
    else if (result === false) failed++;
    else skipped++;
    
    await sleep(5000);
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================\n`);
  
  // Cleanup interactsh
  if (interactshClient) {
    interactshClient.kill();
  }
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
