const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    console.log('\n[essential-skills#2] Deep diagnostic\n');
    
    // Login
    await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#EmailAddress', EMAIL);
    await page.fill('#Password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('#Login'),
    ]);
    await page.waitForTimeout(2000);
    
    // Find and launch lab
    await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const labInfo = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
      const topicLinks = links.filter(el => {
        const a = el.querySelector('a');
        return a?.getAttribute('href')?.includes('/web-security/essential-skills/');
      });
      const unsolved = topicLinks.find(el => !el.className.includes('is-solved'));
      if (!unsolved) return 'SOLVED';
      return {
        href: unsolved.querySelector('a')?.getAttribute('href'),
      };
    });
    
    if (labInfo === 'SOLVED') {
      console.log('Already solved');
      await browser.close();
      return;
    }
    
    await page.goto('https://portswigger.net' + labInfo.href, { waitUntil: 'networkidle', timeout: 30000 });
    const launchLink = await page.$('a[href*="labs/launch"]');
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const base = new URL(page.url()).origin;
    console.log(`Lab URL: ${base}\n`);
    
    // Check /admin content
    const adminRes = await page.goto(`${base}/admin`, { waitUntil: 'networkidle', timeout: 10000 });
    const adminText = await adminRes.text();
    console.log('/admin response (first 2000 chars):');
    console.log(adminText.substring(0, 2000));
    console.log('\n---\n');
    
    // Check if there are any API endpoints in the page source
    const apiMatches = adminText.match(/["']\/[a-zA-Z0-9_-]+["']/g) || [];
    console.log('Possible API endpoints found in /admin:', [...new Set(apiMatches)].slice(0, 20));
    
    // Check posts
    for (let i = 1; i <= 3; i++) {
      const postRes = await page.goto(`${base}/post?postId=${i}`, { waitUntil: 'networkidle', timeout: 10000 });
      const postText = await postRes.text();
      console.log(`\n/post?postId=${i} - checking for non-standard data...`);
      
      // Look for XML or other non-standard formats
      if (postText.includes('<?xml') || postText.includes('<!DOCTYPE')) {
        console.log('  Found XML in post page!');
      }
      
      // Check for API calls in the page
      const apiLinks = postText.match(/["']\/[a-zA-Z0-9_?=-]+["']/g) || [];
      const unique = [...new Set(apiLinks)].filter(l => !l.includes('/resources/') && !l.includes('/post'));
      if (unique.length > 0) {
        console.log('  API endpoints:', unique.slice(0, 10));
      }
    }
    
    // Try search
    await page.goto(`${base}/?search=test`, { waitUntil: 'networkidle', timeout: 10000 });
    const searchText = await page.content();
    console.log('\nSearch page content type:', (await page.evaluate(() => document.contentType)));
    
    // Check for non-standard content types in headers
    const response = await page.goto(base, { waitUntil: 'networkidle', timeout: 10000 });
    const headers = await response.allHeaders();
    console.log('\nHome page headers:', JSON.stringify(headers, null, 2));
    
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
