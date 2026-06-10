#!/usr/bin/env node
/**
 * PortSwigger Blind SQLi Batch Solver — Slow, sequential execution
 * Labs: conditional responses, conditional errors, time delays
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars"); process.exit(1); }
const SOLVER_DIR = "/tmp/wsa-solutions";
const LAB_SPAWN_WAIT = 45000;

const BLIND_LABS = [
  { topic: "sql-injection", num: 11, dir: "SQLInjection", script: "exploit-lab11.py", title: "Blind SQL injection with conditional responses", timeout: 3000000 }, // 50 min
  { topic: "sql-injection", num: 12, dir: "SQLInjection", script: "exploit-lab12.py", title: "Blind SQL injection with conditional errors", timeout: 3000000 }, // 50 min
  { topic: "sql-injection", num: 15, dir: "SQLInjection", script: "exploit-lab15.py", title: "Blind SQL injection with time delays and information retrieval", timeout: 4200000 }, // 70 min
];

async function main() {
  console.log("\n  ┌─────────────────────────────────────────┐");
  console.log("  │   PortSwigger Blind SQLi Solver         │");
  console.log("  │   (SLOW: 30-60 min per lab)             │");
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

  let solved = 0, failed = 0;
  
  for (const lab of BLIND_LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    console.log(`  Expected duration: ${Math.round(lab.timeout/60000)} minutes`);
    
    try {
      // Find lab URL
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

      // Run solver with extended timeout
      const solverPath = resolve(SOLVER_DIR, lab.dir, lab.script);
      console.log(`  Running solver (this will take a while)...`);
      console.log(`  Started at: ${new Date().toISOString()}`);
      
      try {
        const output = execSync(`python3 "${solverPath}" -U "${base}"`, {
          timeout: lab.timeout,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        console.log(output.split("\n").map(l => "    " + l).join("\n"));
      } catch (e) {
        console.log("  Solver output:", (e.stdout || "").split("\n").map(l => "    " + l).join("\n"));
        console.log("  Solver stderr:", (e.stderr || "").split("\n").slice(0, 10).map(l => "    " + l).join("\n"));
      }
      
      console.log(`  Finished at: ${new Date().toISOString()}`);

      // Verify solved
      await page.waitForTimeout(5000);
      const verifyPage = await page.context().newPage();
      await verifyPage.goto(base, { waitUntil: "domcontentloaded", timeout: 15000 });
      const body = await verifyPage.textContent("body").catch(() => "");
      await verifyPage.close();

      if (body?.toLowerCase().includes("congratulations")) {
        console.log("  🎯 SOLVED!");
        solved++;
      } else {
        console.log("  ⬜ Not solved");
        failed++;
      }

    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      failed++;
    }
    
    await page.waitForTimeout(15000);
  }

  console.log(`\n========================================`);
  console.log(`Blind SQLi complete: ${solved} solved, ${failed} failed`);
  console.log(`========================================\n`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
