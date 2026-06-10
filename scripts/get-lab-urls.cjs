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
  await sleep(3000);

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

  // Define remaining labs
  const labs = [
    { topic: 'BusinessLogic', num: 5, dir: 'BusinessLogic', script: 'exploit-lab05.py' },
    { topic: 'BusinessLogic', num: 10, dir: 'BusinessLogic', script: 'exploit-lab10.py' },
    { topic: 'BusinessLogic', num: 12, dir: 'BusinessLogic', script: 'exploit-lab12.py' },
    { topic: 'HostHeader', num: 3, dir: 'HostHeader', script: 'exploit-lab03.py' },
    { topic: 'NoSQL', num: 4, dir: 'NoSQL', script: 'exploit-lab04.py' },
    { topic: 'PrototypePollution', num: 5, dir: 'PrototypePollution', script: 'exploit-lab05.py' },
    { topic: 'InsecureDeserialization', num: 6, dir: 'InsecureDeserialization', script: 'exploit-lab06.py' },
    { topic: 'OAuth', num: 3, dir: 'OAuth', script: 'exploit-lab03.py' },
    { topic: 'OAuth', num: 5, dir: 'OAuth', script: 'exploit-lab05.py' },
    { topic: 'WebCachePoisoning', num: 5, dir: 'WebCachePoisoning', script: 'exploit-lab05.py' },
    { topic: 'WebCachePoisoning', num: 6, dir: 'WebCachePoisoning', script: 'exploit-lab06.py' },
    { topic: 'WebCachePoisoning', num: 9, dir: 'WebCachePoisoning', script: 'exploit-lab09.py' },
    { topic: 'Authentication', num: 5, dir: 'Authentication', script: 'exploit-lab05.py' },
    { topic: 'Websockets', num: 3, dir: 'Websockets', script: 'exploit-lab03.py' },
    { topic: 'RequestSmuggling', num: 6, dir: 'RequestSmuggling', script: 'exploit-lab06.py' },
    { topic: 'RequestSmuggling', num: 12, dir: 'RequestSmuggling', script: 'exploit-lab12.py' },
    { topic: 'RequestSmuggling', num: 13, dir: 'RequestSmuggling', script: 'exploit-lab13.py' },
    { topic: 'RequestSmuggling', num: 14, dir: 'RequestSmuggling', script: 'exploit-lab14.py' },
    { topic: 'RequestSmuggling', num: 15, dir: 'RequestSmuggling', script: 'exploit-lab15.py' },
    { topic: 'RequestSmuggling', num: 16, dir: 'RequestSmuggling', script: 'exploit-lab16.py' },
    { topic: 'RequestSmuggling', num: 17, dir: 'RequestSmuggling', script: 'exploit-lab17.py' },
    { topic: 'RequestSmuggling', num: 18, dir: 'RequestSmuggling', script: 'exploit-lab18.py' },
    { topic: 'RequestSmuggling', num: 19, dir: 'RequestSmuggling', script: 'exploit-lab19.py' },
    { topic: 'RequestSmuggling', num: 20, dir: 'RequestSmuggling', script: 'exploit-lab20.py' },
    { topic: 'RequestSmuggling', num: 21, dir: 'RequestSmuggling', script: 'exploit-lab21.py' },
    { topic: 'RequestSmuggling', num: 22, dir: 'RequestSmuggling', script: 'exploit-lab22.py' },
    { topic: 'SQLInjection', num: 11, dir: 'SQLInjection', script: 'exploit-lab11.py' },
    { topic: 'SQLInjection', num: 12, dir: 'SQLInjection', script: 'exploit-lab12.py' },
    { topic: 'SQLInjection', num: 15, dir: 'SQLInjection', script: 'exploit-lab15.py' },
    { topic: 'SQLInjection', num: 17, dir: 'SQLInjection', script: 'exploit-lab17.py' },
    { topic: 'XSS', num: 22, dir: 'XSS', script: 'exploit-lab22.py' },
    { topic: 'XSS', num: 23, dir: 'XSS', script: 'exploit-lab23.py' },
    { topic: 'XSS', num: 29, dir: 'XSS', script: 'exploit-lab29.py' },
    { topic: 'SSRF', num: 6, dir: 'SSRF', script: 'exploit-lab06.py' },
    { topic: 'OSCommandInjection', num: 4, dir: 'OSCommandInjection', script: 'exploit-lab04.py' },
    { topic: 'OSCommandInjection', num: 5, dir: 'OSCommandInjection', script: 'exploit-lab05.py' },
  ];

  const labUrls = [];

  for (const lab of labs) {
    const topicSlug = topicMap[lab.topic];
    const topicLabs = allLabs[topicSlug] || [];
    
    if (lab.num > topicLabs.length) continue;
    
    const targetLab = topicLabs[lab.num - 1];
    if (!targetLab || targetLab.isSolved) continue;

    console.log(`\n[${lab.topic}#${lab.num}] ${targetLab.title}`);
    
    await page.goto('https://portswigger.net' + targetLab.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    
    // Click access lab and capture the new URL
    let labUrl = null;
    
    // Method 1: Wait for new page
    try {
      const [np] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 10000 }),
        page.click('text=ACCESS THE LAB'),
      ]);
      await np.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await sleep(5000);
      labUrl = np.url();
      await np.close();
    } catch (e) {
      // Method 2: Check if current page navigated
      await page.click('text=ACCESS THE LAB');
      await sleep(8000);
      if (!page.url().includes('portswigger.net')) {
        labUrl = page.url();
      }
    }
    
    if (labUrl && labUrl !== 'about:blank') {
      console.log(`  URL: ${labUrl}`);
      labUrls.push({ ...lab, title: targetLab.title, url: labUrl });
    } else {
      console.log(`  Failed to get URL`);
    }
    
    await sleep(5000);
  }

  // Save lab URLs to file
  const fs = require('fs');
  fs.writeFileSync('/tmp/lab-urls.json', JSON.stringify(labUrls, null, 2));
  console.log(`\nSaved ${labUrls.length} lab URLs to /tmp/lab-urls.json`);

  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
