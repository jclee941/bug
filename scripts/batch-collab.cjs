const { chromium } = require('playwright');
const { execSync } = require('child_process');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const COLLAB = process.env.COLLAB_DOMAIN || 'd7j9tts2olvgic6776g0y766ekedfq6s1.oast.live';

const topicMap = {
  'SQLInjection': 'sql-injection',
  'XSS': 'cross-site-scripting',
  'SSRF': 'ssrf',
  'OSCommandInjection': 'os-command-injection',
};

const collabLabs = [
  { topic: 'SQLInjection', num: 17, dir: 'SQLInjection', script: 'exploit-lab17.py' },
  { topic: 'XSS', num: 22, dir: 'XSS', script: 'exploit-lab22.py' },
  { topic: 'XSS', num: 23, dir: 'XSS', script: 'exploit-lab23.py' },
  { topic: 'XSS', num: 29, dir: 'XSS', script: 'exploit-lab29.py' },
  { topic: 'SSRF', num: 6, dir: 'SSRF', script: 'exploit-lab06.py' },
  { topic: 'OSCommandInjection', num: 4, dir: 'OSCommandInjection', script: 'exploit-lab04.py' },
  { topic: 'OSCommandInjection', num: 5, dir: 'OSCommandInjection', script: 'exploit-lab05.py' },
];

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

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

  const allLabs = await page.evaluate(() => {
    const results = {};
    const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
    links.forEach((el) => {
      const a = el.querySelector('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const title = a.textContent?.trim() || '';
      const isSolved = el.className.includes('is-solved');
      const match = href.match(/\/web-security\/([^/]+)/);
      const topic = match ? match[1] : '';
      if (!topic) return;
      if (!results[topic]) results[topic] = [];
      results[topic].push({ title, href, isSolved });
    });
    return results;
  });

  let solved = 0;
  let failed = 0;
  let skipped = 0;

  for (const lab of collabLabs) {
    const topicSlug = topicMap[lab.topic];
    const topicLabs = allLabs[topicSlug] || [];
    
    if (lab.num > topicLabs.length) {
      console.log(`[${lab.topic}#${lab.num}] Lab number out of range (topic has ${topicLabs.length} labs)`);
      skipped++;
      continue;
    }
    
    const targetLab = topicLabs[lab.num - 1];
    
    if (!targetLab) {
      console.log(`[${lab.topic}#${lab.num}] Lab not found`);
      skipped++;
      continue;
    }
    
    if (targetLab.isSolved) {
      console.log(`[${lab.topic}#${lab.num}] Already solved: ${targetLab.title}`);
      skipped++;
      continue;
    }

    console.log(`\n[${lab.topic}#${lab.num}] ${targetLab.title}`);
    
    await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const [newPage] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }),
      page.click('text=ACCESS THE LAB'),
    ]);
    await newPage.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForTimeout(3000);

    const base = new URL(newPage.url()).origin;
    const solverPath = `/tmp/wsa-solutions/${lab.dir}/${lab.script}`;

    try {
      console.log(`  Lab URL: ${base}`);
      const output = execSync(`python3 "${solverPath}" -U "${base}" -C "${COLLAB}"`, {
        timeout: 300000,
        encoding: 'utf-8',
        cwd: `/tmp/wsa-solutions/${lab.dir}`,
      });
      console.log('  Output:', output.slice(0, 500));

      await newPage.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
      await newPage.waitForTimeout(2000);
      const body = await newPage.content();
      if (body.toLowerCase().includes('congratulations')) {
        console.log(`  SOLVED!`);
        solved++;
      } else {
        console.log(`  Not solved`);
        failed++;
      }
    } catch (e) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
      if (e.stderr) console.log(`  Stderr: ${e.stderr.slice(0, 500)}`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Collab Batch Result: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================`);

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
