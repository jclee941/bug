#!/usr/bin/env node
/**
 * Extract lab hrefs for remaining unsolved labs
 */
const { chromium } = require('playwright');
const fs = require('fs');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  await page.goto('https://portswigger.net/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  await page.waitForTimeout(2000);
  
  await page.goto('https://portswigger.net/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const labs = await page.evaluate(() => {
    const results = [];
    const links = [...document.querySelectorAll('.widgetcontainer-lab-link')];
    const topicCounts = {};
    
    links.forEach((el) => {
      const a = el.querySelector('a');
      if (!a) return;
      
      const href = a.getAttribute('href') || '';
      const title = a.textContent?.trim() || '';
      const isSolved = el.className.includes('is-solved');
      
      const match = href.match(/\/web-security\/([^/]+)/);
      const topic = match ? match[1] : '';
      
      if (!topic) return;
      
      if (!topicCounts[topic]) topicCounts[topic] = 0;
      topicCounts[topic]++;
      
      if (!isSolved) {
        results.push({ topic, title, topicIndex: topicCounts[topic], href });
      }
    });
    
    return results;
  });
  
  fs.writeFileSync('/tmp/remaining-labs.json', JSON.stringify(labs, null, 2));
  console.log(`Extracted ${labs.length} remaining labs to /tmp/remaining-labs.json`);
  
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
