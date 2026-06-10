#!/usr/bin/env node
/**
 * PortSwigger Fast Batch Solver — Runs all non-slow, non-OOB Python labs
 * Skips: request-smuggling, blind SQLi, OOB labs, brute-force auth
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars"); process.exit(1); }
const SOLVER_DIR = "/tmp/wsa-solutions";
const DELAY_BETWEEN_LABS = 10000;
const LAB_SPAWN_WAIT = 45000;

const TOPIC_MAP = {
  "sql-injection": "SQLInjection",
  "cross-site-scripting": "XSS",
  "csrf": "CSRF",
  "clickjacking": "ClickJacking",
  "cors": "CORS",
  "xxe": "XXE",
  "ssrf": "SSRF",
  "os-command-injection": "OSCommandInjection",
  "file-path-traversal": "DirectoryTraversal",
  "access-control": "AccessControl",
  "authentication": "Authentication",
  "websockets": "Websockets",
  "deserialization": "InsecureDeserialization",
  "information-disclosure": "InformationDisclosure",
  "logic-flaws": "BusinessLogic",
  "host-header": "HostHeader",
  "oauth": "OAuth",
  "file-upload": "FileUpload",
  "jwt": "JWT",
  "graphql": "GraphQL",
  "race-conditions": "RaceConditions",
  "nosql-injection": "NoSQL",
  "api-testing": "APITesting",
  "llm-attacks": "LLM",
  "web-cache-deception": "WebCacheDeception",
  "request-smuggling": "RequestSmuggling",
  "server-side-template-injection": "SSTI",
  "web-cache-poisoning": "WebCachePoisoning",
  "prototype-pollution": "PrototypePollution",
  "dom-based": "DOMBasedXSS",
  "essential-skills": "EssentialSkills",
};

// Skip slow/problematic labs for fast batch
const skipPatterns = ['Blind SQL', 'out-of-band', 'steal cookies', 'capture passwords', 'dangling markup', 'request smuggling', 'HTTP request smuggling', 'desync', 'pause-based', 'request tunnelling'];
const skipSolvers = new Set(['XSS/exploit-lab22.py','XSS/exploit-lab23.py','XSS/exploit-lab29.py','OSCommandInjection/exploit-lab04.py','OSCommandInjection/exploit-lab05.py','SSRF/exploit-lab06.py','SQLInjection/exploit-lab17.py']);
const skipTopics = new Set(['request-smuggling']);

async function main() {
  console.log("\n  ┌─────────────────────────────────────────┐");
  console.log("  │   PortSwigger Fast Batch Solver          │");
  console.log("  └─────────────────────────────────────────┘\n");

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("[*] Logging into PortSwigger...");
  await page.goto("https://portswigger.net/users", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("#EmailAddress", EMAIL);
  await page.fill("#Password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click("#Login"),
  ]);
  await page.waitForTimeout(2000);
  console.log("[+] Logged in\n");

  console.log("[*] Fetching labs...");
  await page.goto("https://portswigger.net/web-security/all-labs", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);

  const allLabs = await page.evaluate(() => {
    return [...document.querySelectorAll(".widgetcontainer-lab-link")].map((el) => {
      const a = el.querySelector("a");
      return {
        href: a?.getAttribute("href") || "",
        title: a?.textContent?.trim()?.slice(0, 80) || "",
        difficulty: el.innerHTML.includes("APPRENTICE") ? "APPRENTICE" : el.innerHTML.includes("PRACTITIONER") ? "PRACTITIONER" : "EXPERT",
        topic: (a?.getAttribute("href")?.match(/web-security\/([^\/]+)/)?.[1]) || "unknown",
        solved: el.className.includes("is-solved"),
      };
    });
  });

  const unsolved = allLabs.filter(l => !l.solved);
  console.log(`[*] Total: ${allLabs.length} | Solved: ${allLabs.length - unsolved.length} | Unsolved: ${unsolved.length}\n`);

  const topicIndex = {};
  for (const lab of allLabs) {
    const dir = TOPIC_MAP[lab.topic];
    if (!dir) continue;
    if (!topicIndex[lab.topic]) topicIndex[lab.topic] = [];
    topicIndex[lab.topic].push(lab);
  }

  const solvable = [];
  for (const lab of unsolved) {
    const solverDir = TOPIC_MAP[lab.topic];
    if (!solverDir) continue;
    const dirPath = resolve(SOLVER_DIR, solverDir);
    if (!existsSync(dirPath)) continue;
    const labNum = (topicIndex[lab.topic] || []).findIndex(l => l.href === lab.href) + 1;
    if (labNum === 0) continue;
    const scriptName = `exploit-lab${String(labNum).padStart(2, "0")}.py`;
    if (!existsSync(resolve(dirPath, scriptName))) continue;
    solvable.push({ ...lab, solverDir, labNum, scriptName });
  }

  // Filter for fast batch
  const fastLabs = solvable.filter(lab => {
    const solverKey = `${lab.solverDir}/${lab.scriptName}`;
    return !skipPatterns.some(p => lab.title.includes(p)) &&
           !skipSolvers.has(solverKey) &&
           !skipTopics.has(lab.topic);
  });

  console.log(`[*] ${fastLabs.length} fast labs to solve\n`);

  let solved = 0, failed = 0, skipped = 0;
  for (const lab of fastLabs) {
    console.log(`\n[${lab.difficulty}] ${lab.topic}#${lab.labNum}: ${lab.title}`);
    console.log(`  Solver: ${lab.solverDir}/${lab.scriptName}`);

    try {
      await page.goto("https://portswigger.net" + lab.href, { waitUntil: "networkidle", timeout: 30000 });
      const launchLink = await page.$('a[href*="labs/launch"]');
      if (!launchLink) { console.log("  ❌ No launch link"); failed++; continue; }

      await page.goto("https://portswigger.net" + (await launchLink.getAttribute("href")), {
        waitUntil: "domcontentloaded", timeout: 60000,
      });
      await page.waitForTimeout(LAB_SPAWN_WAIT);

      const labUrl = page.url();
      if (!labUrl.includes("web-security-academy.net")) {
        console.log("  ❌ Lab didn't load"); failed++; continue;
      }

      const base = new URL(labUrl).origin;
      console.log(`  Lab URL: ${base}`);

      // Health check
      let labReady = false;
      for (let hc = 0; hc < 20; hc++) {
        try {
          const testPage = await page.context().newPage();
          const resp = await testPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 10000 });
          const status = resp?.status() || 0;
          await testPage.close();
          if (status >= 200 && status < 500) { labReady = true; break; }
        } catch {}
        await page.waitForTimeout(3000);
      }
      if (!labReady) { console.log("  ❌ Lab not ready"); failed++; continue; }

      // Run Python solver
      const solverPath = resolve(SOLVER_DIR, lab.solverDir, lab.scriptName);
      console.log(`  Running solver...`);
      try {
        const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
          timeout: 120000,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        console.log(output.split("\n").map(l => "    " + l).join("\n"));
      } catch (e) {
        console.log("  Solver output:", (e.stdout || "").split("\n").map(l => "    " + l).join("\n"));
        console.log("  Solver stderr:", (e.stderr || "").split("\n").slice(0,5).map(l => "    " + l).join("\n"));
      }

      // Verify solved
      await page.waitForTimeout(3000);
      const verifyPage = await page.context().newPage();
      await verifyPage.goto(base, { waitUntil: "domcontentloaded", timeout: 15000 });
      const body = await verifyPage.textContent("body").catch(() => "");
      await verifyPage.close();

      if (body?.toLowerCase().includes("congratulations")) {
        console.log("  🎯 SOLVED!");
        solved++;
      } else {
        console.log("  ⬜ Not solved (solver may need adjustments)");
        failed++;
      }

    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      failed++;
    }

    await page.waitForTimeout(DELAY_BETWEEN_LABS);
  }

  console.log(`\n========================================`);
  console.log(`Fast batch complete: ${solved} solved, ${failed} failed, ${skipped} skipped`);
  console.log(`========================================\n`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
