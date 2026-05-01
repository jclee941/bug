#!/usr/bin/env node
/**
 * PortSwigger OOB Batch Solver — Uses interactsh for Collaborator alternative
 * Labs: Blind SQLi OOB, Blind SSRF Shellshock, Blind OS cmd OOB x2
 */
import { chromium } from "playwright";
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars"); process.exit(1); }
const SOLVER_DIR = "/tmp/wsa-solutions";
const LAB_SPAWN_WAIT = 45000;

const OOB_LABS = [
  { topic: "sql-injection", num: 17, dir: "SQLInjection", script: "exploit-lab17.py", title: "Blind SQL injection with out-of-band data exfiltration" },
  { topic: "ssrf", num: 6, dir: "SSRF", script: "exploit-lab06.py", title: "Blind SSRF with Shellshock exploitation" },
  { topic: "os-command-injection", num: 4, dir: "OSCommandInjection", script: "exploit-lab04.py", title: "Blind OS command injection with out-of-band interaction" },
  { topic: "os-command-injection", num: 5, dir: "OSCommandInjection", script: "exploit-lab05.py", title: "Blind OS command injection with out-of-band data exfiltration" },
];

async function startInteractsh() {
  return new Promise((resolve, reject) => {
    console.log("[*] Starting interactsh-client...");
    const proc = spawn("interactsh-client", ["-json", "-poll-interval", "5"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let domain = null;
    
    proc.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        const match = line.match(/([a-z0-9]+\.(oast\.online|oast\.pro|oast\.fun|oast\.live|oast\.site))/);
        if (match && !domain) {
          domain = match[1];
          console.log(`[+] interactsh domain: ${domain}`);
          resolve({ proc, domain });
        }
      }
    });
    
    proc.on("error", (err) => reject(err));
    
    // Timeout if domain not received in 60s
    setTimeout(() => {
      if (!domain) reject(new Error("interactsh domain not received in 60s"));
    }, 60000);
  });
}

async function runSolver(solverPath, base, domain) {
  try {
    const output = execSync(`python3 "${solverPath}" -U "${base}" -C "${domain}"`, {
      timeout: 60000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output };
  } catch (e) {
    return { success: false, output: e.stdout || "", stderr: e.stderr || "" };
  }
}

async function main() {
  console.log("\n  ┌─────────────────────────────────────────┐");
  console.log("  │   PortSwigger OOB Batch Solver         │");
  console.log("  │   (uses interactsh instead of Burp)    │");
  console.log("  └─────────────────────────────────────────┘\n");

  // Start interactsh
  let interactsh;
  try {
    interactsh = await startInteractsh();
  } catch (e) {
    console.error(`❌ Failed to start interactsh: ${e.message}`);
    process.exit(1);
  }

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

  let solved = 0, failed = 0;
  
  for (const lab of OOB_LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    
    try {
      // Find lab URL from all-labs page
      await page.goto("https://portswigger.net/web-security/all-labs", { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);
      
      const labLink = await page.evaluate(({ topic, num }) => {
        const links = [...document.querySelectorAll(".widgetcontainer-lab-link")];
        const topicLinks = links.filter(el => {
          const a = el.querySelector("a");
          return a?.getAttribute("href")?.includes(`/web-security/${topic}/`);
        });
        const target = topicLinks[num - 1];
        if (target?.className.includes("is-solved")) return "SOLVED";
        return target?.querySelector("a")?.getAttribute("href") || null;
      }, { topic: lab.topic, num: lab.num });
      
      if (labLink === "SOLVED") {
        console.log("  ✅ Already solved");
        solved++;
        continue;
      }
      
      if (!labLink) {
        console.log("  ❌ Lab link not found or already solved");
        failed++;
        continue;
      }
      
      await page.goto("https://portswigger.net" + labLink, { waitUntil: "networkidle", timeout: 30000 });
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
      console.log(`  interactsh domain: ${interactsh.domain}`);

      // Run solver with interactsh domain
      const solverPath = resolve(SOLVER_DIR, lab.dir, lab.script);
      console.log(`  Running solver with OOB callback...`);
      const result = await runSolver(solverPath, base, interactsh.domain);
      
      if (result.output) {
        console.log(result.output.split("\n").map(l => "    " + l).join("\n"));
      }
      if (result.stderr) {
        console.log(result.stderr.split("\n").slice(0, 5).map(l => "    " + l).join("\n"));
      }

      // Wait for callback and verify
      console.log("  Waiting 15s for OOB callback...");
      await page.waitForTimeout(15000);
      
      const verifyPage = await page.context().newPage();
      await verifyPage.goto(base, { waitUntil: "domcontentloaded", timeout: 15000 });
      const body = await verifyPage.textContent("body").catch(() => "");
      await verifyPage.close();

      if (body?.toLowerCase().includes("congratulations")) {
        console.log("  🎯 SOLVED!");
        solved++;
      } else {
        console.log("  ⬜ Not solved (may need longer wait or solver adjustment)");
        failed++;
      }

    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      failed++;
    }
    
    await page.waitForTimeout(10000);
  }

  console.log(`\n========================================`);
  console.log(`OOB batch complete: ${solved} solved, ${failed} failed`);
  console.log(`========================================\n`);

  interactsh.proc.kill();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
