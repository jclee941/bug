import http2 from "node:http2";

export async function getCookieHeader(context, base) {
  const cookies = await context.cookies(base);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export async function http2Batch(base, cookieHeader, requests) {
  const client = http2.connect(base);
  const runRequest = (request) =>
    new Promise((resolve, reject) => {
      const headers = {
        ":method": request.method || "GET",
        ":path": request.path,
        cookie: cookieHeader,
        ...request.headers,
      };
      const stream = client.request(headers);
      const chunks = [];
      let responseHeaders = {};
      stream.on("response", (incomingHeaders) => {
        responseHeaders = incomingHeaders;
      });
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        resolve({
          status: Number(responseHeaders[":status"] || 0),
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
      stream.on("error", reject);
      stream.end(request.body || "");
    });

  try {
    return await Promise.all(requests.map((request) => runRequest(request)));
  } finally {
    client.close();
  }
}

export async function openEmailClient(page, base) {
  for (const candidate of ["/email", "/email-client", "/emails"]) {
    try {
      await page.goto(base + candidate, { waitUntil: "domcontentloaded", timeout: 10000 });
      const body = await page.textContent("body").catch(() => "");
      if (body && !body.includes("Not Found")) return base + candidate;
    } catch {}
  }

  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 10000 });
  const link = await page
    .$('a:has-text("Email client"), a[href*="email"]')
    .catch(() => null);
  if (!link) return null;
  const href = await link.getAttribute("href");
  if (!href) return null;
  return href.startsWith("http") ? href : `${base}${href}`;
}

export async function getEmailClientAddress(page, base) {
  const emailUrl = await openEmailClient(page, base);
  if (!emailUrl) return null;
  await page.goto(emailUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
  const body = await page.textContent("body").catch(() => "");
  return body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
}

export async function latestEmailLink(page, emailUrl, pattern) {
  await page.goto(emailUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(1000);
  const links = await page.$$eval(
    "a",
    (anchors) => anchors.map((anchor) => anchor.getAttribute("href") || "").filter(Boolean)
  );
  const href = links.find((link) => pattern.test(link));
  if (href) return href.startsWith("http") ? href : new URL(href, emailUrl).toString();

  const body = await page.textContent("body").catch(() => "");
  const match = body.match(pattern);
  return match ? new URL(match[0], emailUrl).toString() : null;
}

export async function deleteCarlosIfAdmin(page, base) {
  await page.goto(base + "/admin", { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
  const deleteHref = await page
    .$eval('a[href*="delete"][href*="carlos"]', (anchor) => anchor.getAttribute("href"))
    .catch(() => null);
  if (!deleteHref) return false;
  await page.goto(new URL(deleteHref, base).toString(), { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(2000);
  return true;
}

export async function submitApiKey(page, key) {
  await page.evaluate(async (answer) => {
    await fetch("/submitSolution", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `answer=${encodeURIComponent(answer)}`,
    });
  }, key);
  await page.waitForTimeout(1000);
}

export async function registerUserFromEmailClient(page, base, username, password) {
  const emailAddress = await getEmailClientAddress(page, base);
  if (!emailAddress) throw new Error("email client address not found");

  await page.goto(base + "/register", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="email"]', emailAddress);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
    page.click('button[type="submit"], button:has-text("Register")'),
  ]);

  const emailUrl = await openEmailClient(page, base);
  const confirmUrl = await latestEmailLink(page, emailUrl, /\/confirm-registration\?[^\s"'<]+|\/register\?temp-registration-token=[^\s"'<]+/i);
  if (confirmUrl) {
    await page.goto(confirmUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForTimeout(1000);
  }

  return { username, password, emailAddress };
}
