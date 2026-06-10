const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

// All remaining labs with their solvers
const ALL_REMAINING_LABS = [
  // SQL Injection
  { topic: 'sql-injection', num: 11, dir: 'SQLInjection', script: 'exploit-lab11.py', title: 'Blind SQL injection with conditional responses', timeout: 600000 },
  { topic: 'sql-injection', num: 12, dir: 'SQLInjection', script: 'exploit-lab12.py', title: 'Blind SQL injection with conditional errors', timeout: 600000 },
  { topic: 'sql-injection', num: 15, dir: 'SQLInjection', script: 'exploit-lab15.py', title: 'Blind SQL injection with time delays', timeout: 600000 },
  { topic: 'sql-injection', num: 17, dir: 'SQLInjection', script: 'exploit-lab17.py', title: 'Blind SQL injection with OOB data exfiltration', timeout: 300000 },
  
  // XSS
  { topic: 'cross-site-scripting', num: 22, dir: 'XSS', script: 'exploit-lab22.py', title: 'Exploiting XSS to steal cookies', timeout: 300000 },
  { topic: 'cross-site-scripting', num: 23, dir: 'XSS', script: 'exploit-lab23.py', title: 'Exploiting XSS to capture passwords', timeout: 300000 },
  { topic: 'cross-site-scripting', num: 29, dir: 'XSS', script: 'exploit-lab29.py', title: 'Reflected XSS with strict CSP', timeout: 300000 },
  
  // SSRF
  { topic: 'ssrf', num: 6, dir: 'SSRF', script: 'exploit-lab06.py', title: 'Blind SSRF with Shellshock', timeout: 300000 },
  
  // Request Smuggling
  { topic: 'request-smuggling', num: 6, dir: 'RequestSmuggling', script: 'exploit-lab06.py', title: 'Capture other users requests', timeout: 300000 },
  { topic: 'request-smuggling', num: 13, dir: 'RequestSmuggling', script: 'exploit-lab13.py', title: 'Basic CL.TE vulnerability', timeout: 300000 },
  { topic: 'request-smuggling', num: 14, dir: 'RequestSmuggling', script: 'exploit-lab14.py', title: 'Basic TE.CL vulnerability', timeout: 300000 },
  { topic: 'request-smuggling', num: 15, dir: 'RequestSmuggling', script: 'exploit-lab15.py', title: 'Obfuscating the TE header', timeout: 300000 },
  
  // OS Command Injection
  { topic: 'os-command-injection', num: 4, dir: 'OSCommandInjection', script: 'exploit-lab04.py', title: 'Blind OS command injection OOB interaction', timeout: 300000 },
  { topic: 'os-command-injection', num: 5, dir: 'OSCommandInjection', script: 'exploit-lab05.py', title: 'Blind OS command injection OOB data exfiltration', timeout: 300000 },
  
  // Authentication
  { topic: 'authentication', num: 5, dir: 'Authentication', script: 'exploit-lab05.py', title: 'Username enumeration via response timing', timeout: 600000 },
  { topic: 'authentication', num: 12, dir: 'Authentication', script: 'exploit-lab12.py', title: 'Password brute-force via password change', timeout: 600000 },
  
  // WebSockets
  { topic: 'websockets', num: 3, dir: 'Websockets', script: 'exploit-lab03.py', title: 'WebSocket handshake manipulation', timeout: 300000 },
  
  // Web Cache Poisoning
  { topic: 'web-cache-poisoning', num: 5, dir: 'WebCachePoisoning', script: 'exploit-lab05.py', title: 'WCP via unkeyed query string', timeout: 300000 },
  { topic: 'web-cache-poisoning', num: 6, dir: 'WebCachePoisoning', script: 'exploit-lab06.py', title: 'WCP via unkeyed query parameter', timeout: 300000 },
  { topic: 'web-cache-poisoning', num: 9, dir: 'WebCachePoisoning', script: 'exploit-lab09.py', title: 'URL normalization', timeout: 300000 },
  
  // Deserialization
  { topic: 'deserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py', title: 'PHP deserialization pre-built gadget', timeout: 300000 },
  { topic: 'deserialization', num: 8, dir: 'InsecureDeserialization', script: 'exploit-lab08.py', title: 'Java custom gadget chain', timeout: 300000 },
  { topic: 'deserialization', num: 9, dir: 'InsecureDeserialization', script: 'exploit-lab09.py', title: 'PHP custom gadget chain', timeout: 300000 },
  
  // Logic Flaws
  { topic: 'logic-flaws', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py', title: 'Low-level logic flaw', timeout: 300000 },
  { topic: 'logic-flaws', num: 10, dir: 'BusinessLogic', script: 'exploit-lab10.py', title: 'Infinite money logic flaw', timeout: 300000 },
  { topic: 'logic-flaws', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py', title: 'Email parsing discrepancies', timeout: 300000 },
  
  // Host Header
  { topic: 'host-header', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py', title: 'Cache poisoning via ambiguous requests', timeout: 300000 },
  
  // OAuth
  { topic: 'oauth', num: 2, dir: 'OAuth', script: 'exploit-lab02.py', title: 'SSRF via OpenID dynamic client registration', timeout: 300000 },
  { topic: 'oauth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py', title: 'Forced OAuth profile linking', timeout: 300000 },
  { topic: 'oauth', num: 4, dir: 'OAuth', script: 'exploit-lab04.py', title: 'OAuth account hijacking via redirect_uri', timeout: 300000 },
  { topic: 'oauth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py', title: 'Stealing OAuth access tokens via open redirect', timeout: 300000 },
  
  // Prototype Pollution
  { topic: 'prototype-pollution', num: 5, dir: 'PrototypePollution', script: 'exploit-lab05.py', title: 'Client-side prototype pollution', timeout: 300000 },
  
  // NoSQL
  { topic: 'nosql-injection', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py', title: 'NoSQL operator injection', timeout: 300000 },
];

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
    
    // Run solver
    const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;
    if (!existsSync(solverPath)) {
      console.log(`  ❌ Solver not found: ${solverPath}`);
      await ctx.close();
      return false;
    }
    
    try {
      const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
        timeout: lab.timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: `/tmp/wsa-solutions/${lab.dir}`,
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
  console.log('  │   PortSwigger Final Attempt Solver      │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0, skipped = 0;
  for (const lab of ALL_REMAINING_LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    const result = await solveLab(browser, lab);
    if (result === true) solved++;
    else if (result === false) failed++;
    else skipped++;
    
    // Wait between labs
    await new Promise(r => setTimeout(r, 10000));
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================\n`);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
