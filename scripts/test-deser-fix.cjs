const { chromium } = require('playwright');
const { execSync } = require('child_process');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

const LABS = [
  { num: 6, script: 'exploit-lab06.py', title: 'PHP deserialization pre-built gadget' },
  { num: 8, script: 'exploit-lab08.py', title: 'Java custom gadget chain' },
  { num: 9, script: 'exploit-lab09.py', title: 'PHP custom gadget chain' },
];

async function testLab(browser, lab) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    console.log(`\n[deserialization#${lab.num}] ${lab.title}`);
    
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
    
    const labLink = await page.evaluate(({ num }) => {
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      const topicLinks = links.filter(el => {
        const a = el.querySelector('a');
        return a?.getAttribute('href')?.includes('/web-security/deserialization/');
      });
      const target = topicLinks[num - 1];
      if (target?.className.includes('is-solved')) return 'SOLVED';
      return target?.querySelector('a')?.getAttribute('href') || null;
    }, { num: lab.num });
    
    if (labLink === 'SOLVED') {
      console.log('  Already solved');
      await ctx.close();
      return true;
    }
    
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) { console.log('  No launch link'); await ctx.close(); return false; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const base = new URL(page.url()).origin;
    console.log(`  Lab URL: ${base}`);
    
    try {
      const output = execSync(`python3 "/tmp/wsa-solutions/InsecureDeserialization/${lab.script}" -U "${base}"`, {
        timeout: 300000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/tmp/wsa-solutions/InsecureDeserialization',
      });
      console.log(output.split('\n').slice(0, 25).map(l => '    ' + l).join('\n'));
    } catch (e) {
      console.log('  Output:', (e.stdout || '').split('\n').slice(0, 20).map(l => '    ' + l).join('\n'));
      console.log('  Stderr:', (e.stderr || '').split('\n').slice(0, 10).map(l => '    ' + l).join('\n'));
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
  console.log('\nTesting fixed deserialization solvers\n');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  let solved = 0, failed = 0;
  for (const lab of LABS) {
    const result = await testLab(browser, lab);
    if (result) solved++;
    else failed++;
    await new Promise(r => setTimeout(r, 10000));
  }
  
  console.log(`\nResult: ${solved} solved, ${failed} failed`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
