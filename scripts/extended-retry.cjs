const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

// Labs to retry with extended timeouts and better error handling
const RETRY_LABS = [
  // Authentication - brute force needs time
  { topic: 'authentication', num: 14, dir: 'Authentication', script: 'exploit-lab14.py', title: '2FA bypass using a brute-force attack', timeout: 900000 },
  
  // SQL Injection - blind needs time
  { topic: 'sql-injection', num: 11, dir: 'SQLInjection', script: 'exploit-lab11.py', title: 'Blind SQL injection with conditional responses', timeout: 600000 },
  { topic: 'sql-injection', num: 12, dir: 'SQLInjection', script: 'exploit-lab12.py', title: 'Blind SQL injection with conditional errors', timeout: 600000 },
  
  // Request smuggling - retry basic ones
  { topic: 'request-smuggling', num: 13, dir: 'RequestSmuggling', script: 'exploit-lab13.py', title: 'HTTP request smuggling, basic CL.TE vulnerability', timeout: 300000 },
  { topic: 'request-smuggling', num: 14, dir: 'RequestSmuggling', script: 'exploit-lab14.py', title: 'HTTP request smuggling, basic TE.CL vulnerability', timeout: 300000 },
  { topic: 'request-smuggling', num: 15, dir: 'RequestSmuggling', script: 'exploit-lab15.py', title: 'HTTP request smuggling, obfuscating the TE header', timeout: 300000 },
  
  // Deserialization - retry
  { topic: 'deserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py', title: 'Exploiting PHP deserialization with a pre-built gadget chain', timeout: 300000 },
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
    
    const timeout = lab.timeout || 300000;
    
    try {
      const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
        timeout: timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(output.split('\n').slice(0, 30).map(l => '    ' + l).join('\n'));
    } catch (e) {
      console.log('  Output:', (e.stdout || '').split('\n').slice(0, 30).map(l => '    ' + l).join('\n'));
      console.log('  Stderr:', (e.stderr || '').split('\n').slice(0, 10).map(l => '    ' + l).join('\n'));
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
  console.log('  │   PortSwigger Extended Retry Solver     │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0, skipped = 0;
  for (const lab of RETRY_LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    console.log(`  Timeout: ${lab.timeout / 1000}s`);
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
