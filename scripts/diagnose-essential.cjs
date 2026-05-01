const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    console.log('\n[essential-skills#2] Diagnostic\n');
    
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
        title: unsolved.querySelector('a')?.textContent?.trim(),
      };
    });
    
    if (labInfo === 'SOLVED') {
      console.log('Already solved');
      await browser.close();
      return;
    }
    
    console.log('Lab found:', labInfo.title, labInfo.href);
    
    // Launch lab
    await page.goto('https://portswigger.net' + labInfo.href, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Try multiple launch link selectors
    let launchLink = await page.$('a[href*="labs/launch"]');
    if (!launchLink) {
      launchLink = await page.$('a[href*="/academy/labs/launch"]');
    }
    if (!launchLink) {
      const launchLinks = await page.$$('a, button');
      for (const link of launchLinks) {
        const text = await link.textContent();
        if (text && text.toLowerCase().includes('launch')) {
          launchLink = link;
          break;
        }
      }
    }
    if (!launchLink) { console.log('No launch link'); await browser.close(); return; }
    
    await page.goto('https://portswigger.net' + (await launchLink.getAttribute('href')), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(45000);
    
    const base = new URL(page.url()).origin;
    console.log(`Lab URL: ${base}`);
    
    // Explore the lab
    await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Check page content
    const html = await page.content();
    console.log('\nPage title:', await page.title());
    
    // Find all links
    const links = await page.evaluate(() => {
      return [...document.querySelectorAll('a')].map(a => ({
        href: a.getAttribute('href'),
        text: a.textContent?.trim(),
      })).filter(l => l.href && !l.href.startsWith('http'));
    });
    console.log('\nLocal links:', links.slice(0, 20));
    
    // Find all forms
    const forms = await page.evaluate(() => {
      return [...document.querySelectorAll('form')].map(f => ({
        action: f.getAttribute('action'),
        method: f.getAttribute('method'),
        inputs: [...f.querySelectorAll('input, textarea, select')].map(i => ({
          name: i.getAttribute('name'),
          type: i.getAttribute('type'),
          value: i.getAttribute('value'),
        })),
      }));
    });
    console.log('\nForms:', JSON.stringify(forms, null, 2));
    
    // Try various endpoints
    const endpoints = [
      '/api', '/api/users', '/api/products', '/api/keys', '/api/config',
      '/users', '/products', '/admin', '/login', '/register',
      '/swagger.json', '/openapi.json', '/graphql',
    ];
    
    for (const endpoint of endpoints) {
      const response = await page.goto(`${base}${endpoint}`, { waitUntil: 'networkidle', timeout: 10000 });
      if (response) {
        const ct = response.headers()['content-type'] || '';
        const status = response.status();
        const text = await response.text();
        console.log(`\n${endpoint}: ${status} (${ct})`);
        if (text.length < 1000) {
          console.log(text.substring(0, 500));
        } else {
          console.log(`(length: ${text.length})`);
        }
      }
    }
    
    // Check for API documentation or swagger
    await page.goto(`${base}/swagger-ui.html`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
