const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { resolve } = require('path');

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;
const SOLVER_DIR = "/tmp/wsa-solutions";

const LABS = [
  { topic: "clickjacking", num: 2, dir: "ClickJacking", script: "exploit-lab02.py", title: "Clickjacking form prefilled" },
  { topic: "oauth", num: 1, dir: "OAuth", script: "exploit-lab01.py", title: "OAuth implicit flow" },
  { topic: "logic-flaws", num: 5, dir: "BusinessLogic", script: "exploit-lab05.py", title: "Low-level logic flaw" },
  { topic: "logic-flaws", num: 10, dir: "BusinessLogic", script: "exploit-lab10.py", title: "Infinite money logic flaw" },
  { topic: "jwt", num: 8, dir: "JWT", script: "exploit-lab08.py", title: "JWT algorithm confusion" },
  { topic: "nosql-injection", num: 4, dir: "NoSQL", script: "exploit-lab04.py", title: "NoSQL operator injection" },
  { topic: "essential-skills", num: 1, dir: "EssentialSkills", script: "exploit-lab01.py", title: "Targeted scanning" },
  { topic: "host-header", num: 3, dir: "HostHeader", script: "exploit-lab03.py", title: "HH cache poisoning ambiguous" },
];

async function main() {
  console.log("\n  ┌─────────────────────────────────────────┐");
  console.log("  │   PortSwigger Easy Labs Solver         │");
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
  
  for (const lab of LABS) {
    console.log(`\n[${lab.topic}#${lab.num}] ${lab.title}`);
    
    const solverPath = resolve(SOLVER_DIR, lab.dir, lab.script);
    if (!existsSync(solverPath)) {
      console.log(`  ❌ Solver not found`);
      failed++;
      continue;
    }
    
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
        console.log("  ❌ Lab link not found");
        failed++;
        continue;
      }
      
      await page.goto("https://portswigger.net" + labLink, { waitUntil: "networkidle", timeout: 30000 });
      const launchLink = await page.$('a[href*="labs/launch"]');
      if (!launchLink) { console.log("  ❌ No launch link"); failed++; continue; }

      await page.goto("https://portswigger.net" + (await launchLink.getAttribute("href")), {
        waitUntil: "domcontentloaded", timeout: 60000,
      });
      await page.waitForTimeout(45000);

      const labUrl = page.url();
      if (!labUrl.includes("web-security-academy.net")) {
        console.log("  ❌ Lab didn't load"); failed++; continue;
      }

      const base = new URL(labUrl).origin;
      console.log(`  Lab URL: ${base}`);

      // Run solver
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
        console.log("  Solver stderr:", (e.stderr || "").split("\n").slice(0, 5).map(l => "    " + l).join("\n"));
      }

      // Verify solved
      await page.waitForTimeout(3000);
      const verifyPage = await ctx.newPage();
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
    
    await page.waitForTimeout(10000);
  }

  console.log(`\n========================================`);
  console.log(`Easy labs complete: ${solved} solved, ${failed} failed`);
  console.log(`========================================\n`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
