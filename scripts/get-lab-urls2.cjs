const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

const topicMap = {
  'BusinessLogic': 'logic-flaws',
  'HostHeader': 'host-header',
  'NoSQL': 'nosql-injection',
  'OAuth': 'oauth',
  'PrototypePollution': 'prototype-pollution',
  'InsecureDeserialization': 'deserialization',
  'WebCachePoisoning': 'web-cache-poisoning',
  'Authentication': 'authentication',
  'Websockets': 'websockets',
  'RequestSmuggling': 'request-smuggling',
  'SQLInjection': 'sql-injection',
  'XSS': 'cross-site-scripting',
  'SSRF': 'ssrf',
  'OSCommandInjection': 'os-command-injection',
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Login
  await page.goto('https://portswigger.net/users', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await page.click('#Login');
  await sleep(5000);

  // Get labs
  await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

  const allLabs = await page.evaluate(() => {
    const results = {};
    document.querySelectorAll('.widgetcontainer-lab-link').forEach((el) => {
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

  console.log(`Found ${Object.values(allLabs).reduce((a, b) => a + b.length, 0)} labs`);

  // Define remaining labs - focus on ones most likely to work
  const labs = [
    { topic: 'BusinessLogic', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py' },
    { topic: 'HostHeader', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py' },
    { topic: 'NoSQL', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py' },
    { topic: 'OAuth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py' },
    { topic: 'OAuth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py' },
    { topic: 'InsecureDeserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py' },
    { topic: 'Authentication', num: 5, dir: 'Authentication', script: 'exploit-lab05.py' },
  ];

  const labUrls = [];

  for (const lab of labs) {
    try {
      const topicSlug = topicMap[lab.topic];
      const topicLabs = allLabs[topicSlug] || [];
      
      if (lab.num > topicLabs.length) continue;
      
      const targetLab = topicLabs[lab.num - 1];
      if (!targetLab || targetLab.isSolved) {
        console.log(`[${lab.topic}#${lab.num}] Already solved`);
        continue;
      }

      console.log(`\n[${lab.topic}#${lab.num}] ${targetLab.title}`);
      
      await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      
      // Click access lab
      const accessBtn = await page.locator('text=ACCESS THE LAB').first();
      if (await accessBtn.count() === 0) {
        console.log('  No access button found');
        continue;
      }
      
      // Wait for new page
      const newPagePromise = ctx.waitForEvent('page', { timeout: 10000 });
      await accessBtn.click();
      
      let newPage;
      try {
        newPage = await newPagePromise;
      } catch (e) {
        // No new page, check current page
        await sleep(5000);
        if (!page.url().includes('portswigger.net')) {
          newPage = page;
        } else {
          console.log('  No lab page opened');
          continue;
        }
      }
      
      if (newPage !== page) {
        await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 });
      }
      await sleep(10000);
      
      const labUrl = newPage.url();
      if (labUrl && labUrl !== 'about:blank' && !labUrl.includes('portswigger.net')) {
        console.log(`  URL: ${labUrl}`);
        labUrls.push({ ...lab, title: targetLab.title, url: labUrl });
      } else {
        console.log(`  Failed to get URL: ${labUrl}`);
      }
      
      // Close new page if it's different from main page
      if (newPage !== page) {
        await newPage.close();
      }
      
      await sleep(5000);
    } catch (e) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
    }
  }

  // Save lab URLs
  const fs = require('fs');
  fs.writeFileSync('/tmp/lab-urls.json', JSON.stringify(labUrls, null, 2));
  console.log(`\nSaved ${labUrls.length} lab URLs`);

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
