#!/usr/bin/env node
/**
 * PortSwigger Request Smuggling Batch Solver
 * Labs: All 12 request smuggling labs
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

const SMUGGLING_LABS = [
  { num: 13, script: "exploit-lab13.py", title: "HTTP request smuggling, basic CL.TE vulnerability", diff: "PRACTITIONER" },
  { num: 14, script: "exploit-lab14.py", title: "HTTP request smuggling, basic TE.CL vulnerability", diff: "PRACTITIONER" },
  { num: 15, script: "exploit-lab15.py", title: "HTTP request smuggling, obfuscating the TE header", diff: "PRACTITIONER" },
  { num: 12, script: "exploit-lab12.py", title: "CL.0 request smuggling", diff: "PRACTITIONER" },
  { num: 6, script: "exploit-lab06.py", title: "Exploiting HTTP request smuggling to capture other users' requests", diff: "PRACTITIONER" },
  { num: 16, script: "exploit-lab16.py", title: "Exploiting HTTP request smuggling to perform web cache poisoning", diff: "EXPERT" },
  { num: 17, script: "exploit-lab17.py", title: "Exploiting HTTP request smuggling to perform web cache deception", diff: "EXPERT" },
  { num: 18, script: "exploit-lab18.py", title: "Bypassing access controls via HTTP/2 request tunnelling", diff: "EXPERT" },
  { num: 19, script: "exploit-lab19.py", title: "Web cache poisoning via HTTP/2 request tunnelling", diff: "EXPERT" },
  { num: 20, script: "exploit-lab20.py", title: "Client-side desync", diff: "EXPERT" },
  { num: 21, script: "exploit-lab21.py", title: "Server-side pause-based request smuggling", diff: "EXPERT" },
  { num: 11, script: "exploit-lab11.py", title: "0.CL request smuggling", diff: "EXPERT" },
];

async function main() {
  console.log("\n  ┌─────────────────────────────────────────┐");
  console.log("  │   PortSwigger Request Smuggling Solver  │");
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
  
  for (const lab of SMUGGLING_LABS) {
    console.log(`\n[${lab.diff}] request-smuggling#${lab.num}: ${lab.title}`);
    
    const solverPath = resolve(SOLVER_DIR, "RequestSmuggling", lab.script);
    if (!existsSync(solverPath)) {
      console.log(`  ❌ Solver not found: ${solverPath}`);
      failed++;
      continue;
    }
    
    try {
      // Find lab URL
      await page.goto("https://portswigger.net/web-security/all-labs", { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);
      
      const labLink = await page.evaluate(({ num }) => {
        const links = [...document.querySelectorAll(".widgetcontainer-lab-link")];
        const topicLinks = links.filter(el => {
          const a = el.querySelector("a");
          return a?.getAttribute("href")?.includes("/web-security/request-smuggling/");
        });
        const target = topicLinks[num - 1];
        if (target?.className.includes("is-solved")) return "SOLVED";
        return target?.querySelector("a")?.getAttribute("href") || null;
      }, { num: lab.num });
      
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

      // Run solver with -U flag
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
        console.log("  Solver stderr:", (e.stderr || "").split("\n").slice(0, 10).map(l => "    " + l).join("\n"));
      }

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
  console.log(`Smuggling complete: ${solved} solved, ${failed} failed`);
  console.log(`========================================\n`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
