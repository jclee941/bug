const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars");
  process.exit(1);
}

const LABS = [
  { topic: 'deserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py', title: 'PHP deserialization pre-built gadget', timeout: 300000 },
  { topic: 'deserialization', num: 8, dir: 'InsecureDeserialization', script: 'exploit-lab08.py', title: 'Java custom gadget chain', timeout: 300000 },
  { topic: 'deserialization', num: 9, dir: 'InsecureDeserialization', script: 'exploit-lab09.py', title: 'PHP custom gadget chain', timeout: 300000 },
  { topic: 'oauth', num: 2, dir: 'OAuth', script: 'exploit-lab05.py', title: 'SSRF via OpenID dynamic client registration', timeout: 300000 },
  { topic: 'oauth', num: 3, dir: 'OAuth', script: 'exploit-lab02.py', title: 'Forced OAuth profile linking', timeout: 300000 },
  { topic: 'oauth', num: 4, dir: 'OAuth', script: 'exploit-lab03.py', title: 'OAuth account hijacking via redirect_uri', timeout: 300000 },
  { topic: 'oauth', num: 5, dir: 'OAuth', script: 'exploit-lab04.py', title: 'Stealing OAuth access tokens via open redirect', timeout: 300000 },
  { topic: 'oauth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py', title: 'Forced OAuth profile linking', timeout: 300000 },
  { topic: 'oauth', num: 4, dir: 'OAuth', script: 'exploit-lab04.py', title: 'OAuth account hijacking via redirect_uri', timeout: 300000 },
  { topic: 'oauth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py', title: 'Stealing OAuth access tokens via open redirect', timeout: 300000 },
  { topic: 'essential-skills', num: 2, dir: 'EssentialSkills', script: 'exploit-lab02.py', title: 'Essential skills lab 2', timeout: 300000 },
];

async function solveLab(browser, lab) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await page.waitForTimeout(2000);
    
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
      console.log('  Already solved');
      await ctx.close();
      return true;
    }
    if (!labLink) {
      console.log('  Lab not found');
      await ctx.close();
      return false;
    }
    
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) { console.log('  No launch link'); await ctx.close(); return false; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const labUrl = page.url();
    if (!labUrl.includes('web-security-academy.net')) {
      console.log('  Lab did not load');
      await ctx.close();
      return false;
    }
    
    const base = new URL(labUrl).origin;
    console.log(`  Lab URL: ${base}`);
    
    const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;
    if (!existsSync(solverPath)) {
      console.log(`  Solver not found: ${solverPath}`);
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
    
    await page.waitForTimeout(3000);
    const verifyPage = await ctx.newPage();
    await verifyPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await verifyPage.textContent('body').catch(() => '');
    await verifyPage.close();
    
    const solved = body?.toLowerCase().includes('congratulations');
    console.log(solved ? '  SOLVED!' : '  Not solved');
    
    await ctx.close();
    return solved;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    await ctx.close();
    return false;
  }
}

async function main() {
  console.log('\nBatch D: Deserialization, OAuth, EssentialSkills\n');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0, skipped = 0;
  for (const lab of LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    const result = await solveLab(browser, lab);
    if (result === true) solved++;
    else if (result === false) failed++;
    else skipped++;
    await new Promise(r => setTimeout(r, 8000));
  }
  
  console.log(`\n========================================`);
  console.log(`Batch D Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================\n`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
