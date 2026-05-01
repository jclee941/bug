#!/usr/bin/env node
/**
 * PortSwigger Lab Runner — Orchestrates lab launch + Python solver execution
 * 
 * Uses gwyomarch/WebSecurityAcademy Python scripts (256 labs) as solvers.
 * Handles: login, lab launch, URL extraction, solver execution, rate limiting.
 * 
 * Usage:
 *   node scripts/lab-runner.mjs                    # Run all unsolved
 *   node scripts/lab-runner.mjs --topic FileUpload  # Specific topic
 *   node scripts/lab-runner.mjs --dry-run           # List without solving
 */
import { chromium } from "playwright";
import { execSync, exec } from "child_process";
import { readdirSync, existsSync } from "fs";
import { resolve } from "path";

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars"); process.exit(1); }
const SOLVER_DIR = "/tmp/wsa-solutions";
const DELAY_BETWEEN_LABS = 15000; // 15s between labs
const LAB_SPAWN_WAIT = 45000; // 45s for lab to spawn

const args = process.argv.slice(2);
const topicFilter = args.includes("--topic") ? args[args.indexOf("--topic") + 1] : null;
const dryRun = args.includes("--dry-run");
const maxLabs = args.includes("--max") ? parseInt(args[args.indexOf("--max") + 1]) : 999;

// Topic name mapping: PortSwigger URL path → solution directory name
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

async function main() {
  console.log("\n  ┌─────────────────────────────────────┐");
  console.log("  │   PortSwigger Lab Runner (API-based) │");
  console.log("  └─────────────────────────────────────┘\n");

  // Verify solver repo exists
  if (!existsSync(SOLVER_DIR)) {
    console.log("Solver repo not found. Cloning...");
    execSync(`git clone --depth 1 https://github.com/gwyomarch/WebSecurityAcademy.git ${SOLVER_DIR}`, { stdio: "inherit" });
  }

  // Install Python dependencies
  try {
    execSync("pip install requests beautifulsoup4 urllib3 2>/dev/null || pip3 install requests beautifulsoup4 urllib3 2>/dev/null", { timeout: 30000 });
  } catch {}

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Login
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

  // Get ALL labs (including solved) for correct numbering
  console.log("[*] Fetching labs...");
  await page.goto("https://portswigger.net/web-security/all-labs", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);

  const allLabsFull = await page.evaluate(() => {
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

  const unsolved = allLabsFull.filter(l => !l.solved);
  console.log(`[*] Total: ${allLabsFull.length} | Solved: ${allLabsFull.length - unsolved.length} | Unsolved: ${unsolved.length}\n`);

  // Build topic-ordered index (includes solved for correct numbering)
  const topicIndex = {};
  for (const lab of allLabsFull) {
    const dir = TOPIC_MAP[lab.topic];
    if (!dir) continue;
    if (!topicIndex[lab.topic]) topicIndex[lab.topic] = [];
    topicIndex[lab.topic].push(lab);
  }

  // Match unsolved labs to solver scripts by topic position
  const solvable = [];
  for (const lab of unsolved) {
    const solverDir = TOPIC_MAP[lab.topic];
    if (!solverDir) continue;
    if (topicFilter && solverDir !== topicFilter && lab.topic !== topicFilter) continue;
    const dirPath = resolve(SOLVER_DIR, solverDir);
    if (!existsSync(dirPath)) continue;
    const labNum = (topicIndex[lab.topic] || []).findIndex(l => l.href === lab.href) + 1;
    if (labNum === 0) continue;
    const scriptName = `exploit-lab${String(labNum).padStart(2, "0")}.py`;
    if (!existsSync(resolve(dirPath, scriptName))) continue;
    solvable.push({ ...lab, solverDir, labNum, scriptName });
  }

  console.log(`[*] ${solvable.length} labs have matching solvers`);
  if (dryRun) {
    solvable.forEach((l, i) => console.log(`  [${i + 1}] ${l.difficulty} ${l.topic}#${l.labNum}: ${l.title}`));
    await browser.close();
    return;
  }

  let solved = 0, failed = 0, skipped = 0;
  // Skip labs needing Burp Collaborator or brute-force
  const skipPatterns = ['Blind SQL', 'out-of-band', 'steal cookies', 'capture passwords', 'dangling markup', 'request smuggling', 'HTTP request smuggling', 'desync', 'pause-based', 'request tunnelling'];
  const skipSolvers = new Set(['XSS/exploit-lab22.py','XSS/exploit-lab23.py','XSS/exploit-lab29.py','OSCommandInjection/exploit-lab04.py','OSCommandInjection/exploit-lab05.py','SSRF/exploit-lab06.py','SQLInjection/exploit-lab17.py']);
  const skipTopics = new Set(['request-smuggling', 'race-conditions', 'llm-attacks', 'web-cache-deception']);
  const skipSlow = !args.includes('--include-slow');
  for (const lab of solvable) {
    if (solved + failed >= maxLabs) break;
    const labNum = lab.labNum;
    console.log(`\n[${lab.difficulty}] ${lab.topic}#${labNum}: ${lab.title}`);
    console.log(`  Solver: ${lab.solverDir}/${lab.scriptName}`);

    const solverKey = `${lab.solverDir}/${lab.scriptName}`;
    if (skipSlow && (skipPatterns.some(p => lab.title.includes(p)) || skipSolvers.has(solverKey) || skipTopics.has(lab.topic))) {
      console.log('  ⏭ Skipping (needs Collaborator or slow)');
      skipped++;
      continue;
    }

    try {
      // Launch lab
      await page.goto("https://portswigger.net" + lab.href, { waitUntil: "networkidle", timeout: 30000 });
      const launchLink = await page.$('a[href*="labs/launch"]');
      if (!launchLink) { console.log("  ❌ No launch link"); failed++; continue; }

      await page.goto("https://portswigger.net" + (await launchLink.getAttribute("href")), {
        waitUntil: "domcontentloaded", timeout: 60000,
      });
      await page.waitForTimeout(LAB_SPAWN_WAIT);

      const labUrl = page.url();
      if (!labUrl.includes("web-security-academy.net")) {
        console.log("  ❌ Lab didn't load");
        failed++;
        continue;
      }

      const base = new URL(labUrl).origin;
      console.log(`  Lab URL: ${base}`);

      // Health check: wait until lab is actually accessible via direct page load
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
        if (hc > 0 && hc % 5 === 0) console.log(`    Waiting for lab to be ready... (${hc * 3}s)`);
      }
      if (!labReady) {
        console.log("  \u274c Lab not accessible after 60s");
        failed++;
        continue;
      }
      console.log("  Lab is ready")

      // Run Python solver (no proxy)
      try {
        // Add default args for solvers that need extra params
        let extraArgs = "";
        if (lab.solverDir === "DirectoryTraversal") extraArgs = ' -F /etc/passwd';
        if (lab.solverDir === "OSCommandInjection" && lab.labNum >= 3) extraArgs = ' -C whoami';
        const output = execSync(
          `cd "${resolve(SOLVER_DIR, lab.solverDir)}" && python3 ${lab.scriptName} -U "${base}"${extraArgs} 2>&1 || true`,
          { timeout: 180000, maxBuffer: 4 * 1024 * 1024 } // 3 min timeout per solver
        ).toString();
        
        const lastLines = output.split("\n").slice(-10).join("\n");
        console.log(`  Solver output:\n${lastLines.split("\n").map(l => "    " + l).join("\n")}`);

        // Check if solved
        await page.goto(base, { waitUntil: "domcontentloaded", timeout: 10000 });
        const bodyText = await page.textContent("body");
        if (bodyText?.toLowerCase().includes("congratulations")) {
          console.log("  🎯 SOLVED!");
          solved++;
        } else {
          console.log("  ⬜ Not solved (solver may need adjustments)");
          failed++;
        }
      } catch (e) {
        console.log(`  ❌ Solver error: ${e.message.slice(0, 100)}`);
        failed++;
      }
    } catch (e) {
      console.log(`  ❌ ${e.message.slice(0, 80)}`);
      failed++;
    }

    // Rate limit delay
    await page.waitForTimeout(DELAY_BETWEEN_LABS);
  }

  // Final status
  console.log("\n========== RESULTS ==========");
  console.log(`Solved: ${solved} | Failed: ${failed} | Skipped: ${skipped}`);

  // Check total progress
  await page.goto("https://portswigger.net/web-security/all-labs", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);
  const total = await page.evaluate(() => {
    const all = document.querySelectorAll(".widgetcontainer-lab-link");
    const solved = [...all].filter((e) => e.className.includes("is-solved")).length;
    return { total: all.length, solved };
  });
  console.log(`\nOverall: ${total.solved}/${total.total} (${Math.round((total.solved / total.total) * 100)}%)`);

  await browser.close();
}

main().catch(console.error);
