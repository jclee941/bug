const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

// Labs that might work with Python solvers on retry
const LABS_TO_TRY = [
  // Deserialization - retry with fixes
  { topic: 'deserialization', num: 8, dir: 'InsecureDeserialization', script: 'exploit-lab08.py', title: 'Developing a custom gadget chain for Java deserialization', timeout: 300000 },
  { topic: 'deserialization', num: 9, dir: 'InsecureDeserialization', script: 'exploit-lab09.py', title: 'Developing a custom gadget chain for PHP deserialization', timeout: 300000 },
  
  // Web cache poisoning - retry
  { topic: 'web-cache-poisoning', num: 5, dir: 'WebCachePoisoning', script: 'exploit-lab05.py', title: 'Web cache poisoning via an unkeyed query string', timeout: 300000 },
  { topic: 'web-cache-poisoning', num: 6, dir: 'WebCachePoisoning', script: 'exploit-lab06.py', title: 'Web cache poisoning via an unkeyed query parameter', timeout: 300000 },
  
  // NoSQL - retry
  { topic: 'nosql-injection', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py', title: 'Exploiting NoSQL operator injection to extract unknown fields', timeout: 300000 },
  
  // OAuth - retry
  { topic: 'oauth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py', title: 'Forced OAuth profile linking', timeout: 300000 },
  { topic: 'oauth', num: 4, dir: 'OAuth', script: 'exploit-lab04.py', title: 'OAuth account hijacking via redirect_uri', timeout: 300000 },
  
  // Logic flaws - retry
  { topic: 'logic-flaws', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py', title: 'Bypassing access controls using email address parsing discrepancies', timeout: 300000 },
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
  console.log('  │   PortSwigger Retry Batch 3             │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0, skipped = 0;
  for (const lab of LABS_TO_TRY) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    const result = await solveLab(browser, lab);
    if (result === true) solved++;
    else if (result === false) failed++;
    else skipped++;
    
    await new Promise(r => setTimeout(r, 10000));
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================\n`);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
