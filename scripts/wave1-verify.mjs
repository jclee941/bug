#!/usr/bin/env node
import fs from "node:fs/promises";
import { chromium } from "playwright";

const EMAIL = process.env.PORTSWIGGER_EMAIL;
const PASSWORD = process.env.PORTSWIGGER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set PORTSWIGGER_EMAIL and PORTSWIGGER_PASSWORD env vars");
  process.exit(1);
}

const TARGETS = [
  ["race-1", "/web-security/race-conditions/lab-race-conditions-limit-overrun"],
  ["race-2", "/web-security/race-conditions/lab-race-conditions-bypassing-rate-limits"],
  ["race-4", "/web-security/race-conditions/lab-race-conditions-single-endpoint"],
  ["race-5", "/web-security/race-conditions/lab-race-conditions-exploiting-time-sensitive-vulnerabilities"],
  ["race-6", "/web-security/race-conditions/lab-race-conditions-partial-construction"],
  ["llm-2", "/web-security/llm-attacks/lab-exploiting-vulnerabilities-in-llm-apis"],
  ["llm-3", "/web-security/llm-attacks/lab-indirect-prompt-injection"],
  ["llm-4", "/web-security/llm-attacks/lab-exploiting-insecure-output-handling-in-llms"],
  ["cache-2", "/web-security/web-cache-deception/lab-wcd-exploiting-path-delimiters"],
  ["cache-3", "/web-security/web-cache-deception/lab-wcd-exploiting-origin-server-normalization"],
  ["cache-4", "/web-security/web-cache-deception/lab-wcd-exploiting-cache-server-normalization"],
  ["cache-5", "/web-security/web-cache-deception/lab-wcd-exploiting-exact-match-cache-rules"],
  ["essential-2", "/web-security/essential-skills/using-burp-scanner-during-manual-testing/lab-scanning-non-standard-data-structures"],
];

async function login(page) {
  await page.goto("https://portswigger.net/users", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("#EmailAddress", EMAIL);
  await page.fill("#Password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    page.click("#Login"),
  ]);
  await page.waitForTimeout(1500);
}

async function verifyTarget(browser, id, path) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page);
    await page.goto(`https://portswigger.net${path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);
    const solved = await page.evaluate(() => {
      const solvedBadge = document.querySelector(".widgetcontainer-lab-link.is-solved");
      const body = document.body?.innerText || "";
      return Boolean(solvedBadge) || body.includes("Congratulations");
    });
    return { id, path, solved };
  } catch (error) {
    return { id, path, solved: false, error: error.message };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
for (const [id, path] of TARGETS) {
  results.push(await verifyTarget(browser, id, path));
}
await browser.close();

const solved = results.filter((r) => r.solved).map((r) => r.id);
const failed = results.filter((r) => !r.solved).map((r) => ({ id: r.id, reason: r.error || "not solved" }));
const payload = { solved, failed, details: results };

await fs.writeFile("/tmp/wave1-gap-results.json", JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
