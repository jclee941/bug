const { chromium } = require('playwright');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  try {
    console.log('\n[essential-skills#2] XML Investigation\n');
    
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
      return { href: unsolved.querySelector('a')?.getAttribute('href') };
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
    
    // Check XML content in posts
    for (let i = 1; i <= 3; i++) {
      const response = await page.goto(`${base}/post?postId=${i}`, { waitUntil: 'networkidle', timeout: 10000 });
      const html = await response.text();
      
      // Extract XML content
      const xmlMatch = html.match(/<\?xml[\s\S]*?<\/[^\u003e]+>/);
      if (xmlMatch) {
        console.log(`/post?postId=${i} XML:`);
        console.log(xmlMatch[0].substring(0, 2000));
        console.log('\n---\n');
      }
    }
    
    // Check what content types are available via Accept header
    const testEndpoint = `${base}/post?postId=1`;
    console.log('Testing different Accept headers...');
    
    const contentTypes = [
      'application/xml',
      'text/xml',
      'application/json',
      'text/plain',
      '*/*',
    ];
    
    for (const ct of contentTypes) {
      const res = await page.evaluate(({ url, ct }) => {
        return fetch(url, {
          headers: { 'Accept': ct },
          credentials: 'include'
        }).then(r => ({
          status: r.status,
          contentType: r.headers.get('content-type'),
          text: r.text(),
        }));
      }, { url: testEndpoint, ct });
      
      const text = await res.text;
      console.log(`Accept: ${ct} => ${res.status} (${res.contentType})`);
      if (text.includes('<?xml')) {
        console.log('  Contains XML!');
        console.log(text.substring(0, 500));
      }
    }
    
    // Try search with XML
    console.log('\nTrying search endpoint...');
    const searchRes = await page.goto(`${base}/?search=test`, { waitUntil: 'networkidle', timeout: 10000 });
    const searchHtml = await searchRes.text();
    if (searchHtml.includes('<?xml')) {
      console.log('Search returns XML!');
      const xml = searchHtml.match(/<\?xml[\s\S]*?<\/[^\u003e]+>/);
      if (xml) console.log(xml[0].substring(0, 1000));
    }
    
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
