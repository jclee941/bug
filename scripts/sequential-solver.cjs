const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

const LABS = [
  // OAuth
  { topic: 'oauth', num: 2, dir: 'OAuth', script: 'exploit-lab02.py', title: 'OAuth SSRF via OpenID' },
  { topic: 'oauth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py', title: 'OAuth forced profile linking' },
  { topic: 'oauth', num: 4, dir: 'OAuth', script: 'exploit-lab04.py', title: 'OAuth redirect_uri hijacking' },
  { topic: 'oauth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py', title: 'OAuth token stealing' },
  
  // Logic flaws
  { topic: 'logic-flaws', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py', title: 'Low-level logic flaw' },
  { topic: 'logic-flaws', num: 10, dir: 'BusinessLogic', script: 'exploit-lab10.py', title: 'Infinite money logic flaw' },
  { topic: 'logic-flaws', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py', title: 'Email parsing discrepancies' },
  
  // Host header
  { topic: 'host-header', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py', title: 'HH cache poisoning ambiguous' },
  { topic: 'host-header', num: 7, dir: 'HostHeader', script: 'exploit-lab07.py', title: 'HH password reset dangling' },
  
  // Web cache poisoning
  { topic: 'web-cache-poisoning', num: 5, dir: 'WebCachePoisoning', script: 'exploit-lab05.py', title: 'WCP unkeyed query string' },
  { topic: 'web-cache-poisoning', num: 6, dir: 'WebCachePoisoning', script: 'exploit-lab06.py', title: 'WCP unkeyed query param' },
  { topic: 'web-cache-poisoning', num: 9, dir: 'WebCachePoisoning', script: 'exploit-lab09.py', title: 'WCP URL normalization' },
  
  // Deserialization
  { topic: 'deserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py', title: 'PHP pre-built gadget' },
  
  // Authentication
  { topic: 'authentication', num: 5, dir: 'Authentication', script: 'exploit-lab05.py', title: 'Auth timing enumeration' },
  { topic: 'authentication', num: 12, dir: 'Authentication', script: 'exploit-lab12.py', title: 'Password change brute-force' },
  { topic: 'authentication', num: 13, dir: 'Authentication', script: 'exploit-lab13.py', title: 'Multiple credentials per request' },
  { topic: 'authentication', num: 14, dir: 'Authentication', script: 'exploit-lab14.py', title: '2FA brute-force' },
  
  // Other
  { topic: 'clickjacking', num: 2, dir: 'ClickJacking', script: 'exploit-lab02.py', title: 'Clickjacking form prefilled' },
  { topic: 'xxe', num: 8, dir: 'XXE', script: 'exploit-lab08.py', title: 'XXE via image upload' },
  { topic: 'prototype-pollution', num: 5, dir: 'PrototypePollution', script: 'exploit-lab05.py', title: 'Client-side PP' },
  { topic: 'nosql-injection', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py', title: 'NoSQL operator injection' },
  { topic: 'websockets', num: 3, dir: 'Websockets', script: 'exploit-lab03.py', title: 'WebSocket handshake' },
  { topic: 'essential-skills', num: 1, dir: 'EssentialSkills', script: 'exploit-lab01.py', title: 'Targeted scanning' },
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
      console.log(`  ✅ Already solved`);
      await ctx.close();
      return true;
    }
    if (!labLink) {
      console.log(`  ❌ Lab not found`);
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
  console.log('  │   PortSwigger Sequential Solver         │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0, skipped = 0;
  for (const lab of LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    const result = await solveLab(browser, lab);
    if (result === true) solved++;
    else if (result === false) failed++;
    else skipped++;
    
    // Wait between labs to avoid rate limiting
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================\n`);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
