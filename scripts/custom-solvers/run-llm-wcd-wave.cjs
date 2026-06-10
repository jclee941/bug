const { spawnSync } = require('child_process');
const { writeFileSync } = require('fs');

const RESULT_PATH = '/tmp/wave-llm-wcd-results.json';
const BASE = '/home/jclee/dev/bug';
const LABS = [
  { id: 'llm-2', file: 'scripts/custom-solvers/solve-llm-2.cjs', title: 'Exploiting vulnerabilities in LLM APIs' },
  { id: 'llm-3', file: 'scripts/custom-solvers/solve-llm-3.cjs', title: 'Indirect prompt injection' },
  { id: 'llm-4', file: 'scripts/custom-solvers/solve-llm-4.cjs', title: 'Exploiting insecure output handling in LLMs' },
  { id: 'llm-5', file: 'scripts/custom-solvers/solve-llm-5.cjs', title: 'Exploiting AI agents to perform destructive actions' },
  { id: 'llm-6', file: 'scripts/custom-solvers/solve-llm-6.cjs', title: 'Exploiting AI agents to exfiltrate sensitive information' },
  { id: 'llm-7', file: 'scripts/custom-solvers/solve-llm-7.cjs', title: 'Exploiting AI agents to trigger secondary vulnerabilities' },
  { id: 'llm-8', file: 'scripts/custom-solvers/solve-llm-8.cjs', title: 'Bypassing AI scanner defenses to exfiltrate sensitive information' },
  { id: 'wcd-2', file: 'scripts/custom-solvers/solve-wcd-2.cjs', title: 'Exploiting path delimiters for web cache deception' },
  { id: 'wcd-3', file: 'scripts/custom-solvers/solve-wcd-3.cjs', title: 'Exploiting origin server normalization for web cache deception' },
  { id: 'wcd-4', file: 'scripts/custom-solvers/solve-wcd-4.cjs', title: 'Exploiting cache server normalization for web cache deception' },
  { id: 'wcd-5', file: 'scripts/custom-solvers/solve-wcd-5.cjs', title: 'Exploiting exact-match cache rules for web cache deception' },
];

function saveResults(results) {
  writeFileSync(RESULT_PATH, JSON.stringify(results, null, 2) + '\n');
}

const results = [];
for (const lab of LABS) {
  console.log(`\n[RUN] ${lab.id} ${lab.title}`);
  const startedAt = new Date().toISOString();
  const run = spawnSync('node', [lab.file], {
    cwd: BASE,
    env: process.env,
    encoding: 'utf8',
    timeout: 900000,
    maxBuffer: 1024 * 1024 * 8,
  });
  const stdout = run.stdout || '';
  const stderr = run.stderr || '';
  const output = `${stdout}${stderr}`.trim();
  const solved = run.status === 0 && /\bSOLVED\b/i.test(output);
  const entry = {
    id: lab.id,
    title: lab.title,
    file: lab.file,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: run.status,
    solved,
    output,
  };
  results.push(entry);
  saveResults(results);
  console.log(solved ? '[OK]' : '[FAIL]');
}

const solvedCount = results.filter((entry) => entry.solved).length;
const failedCount = results.length - solvedCount;
console.log(`SOLVED ${solvedCount}/11, FAILED ${failedCount}`);
