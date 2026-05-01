const { execFileSync, spawnSync } = require('child_process');
const { writeFileSync } = require('fs');

const { currentInteractshDomain, makeMarker, pollForInteraction, sleep } = require('./_oob.cjs');

const RESULTS_FILE = '/tmp/wave-oob-retry-results.json';
const INTERACTSH_LOG = '/tmp/interactsh.log';
const INTERACTSH_CLIENT = '/home/jclee/go/bin/interactsh-client';
const DEFAULT_DOMAIN = 'd7jfvg42olvhrceld9ig66fgmd3gbt9dt.oast.pro';
const OOB_BLOCKER_NOTE = 'PortSwigger Academy explicitly blocks arbitrary external systems for these labs. Burp Collaborator default public server is required.';

const LABS = [
  {
    key: 'sqli17',
    title: 'Blind SQL injection with out-of-band data exfiltration',
    script: '/home/jclee/dev/bug/scripts/custom-solvers/solve-oob-sqli17.cjs',
  },
  {
    key: 'ssrf6',
    title: 'Blind SSRF with Shellshock exploitation',
    script: '/home/jclee/dev/bug/scripts/custom-solvers/solve-oob-ssrf6.cjs',
  },
  {
    key: 'oscmd4',
    title: 'Blind OS command injection with out-of-band interaction',
    script: '/home/jclee/dev/bug/scripts/custom-solvers/solve-oob-oscmd4.cjs',
  },
  {
    key: 'oscmd5',
    title: 'Blind OS command injection with out-of-band data exfiltration',
    script: '/home/jclee/dev/bug/scripts/custom-solvers/solve-oob-oscmd5.cjs',
  },
  {
    key: 'host-header3',
    title: 'Web cache poisoning via ambiguous requests',
    script: '/home/jclee/dev/bug/scripts/custom-solvers/solve-oob-host-header3.cjs',
  },
];

function writeResults(results) {
  writeFileSync(RESULTS_FILE, `${JSON.stringify(results, null, 2)}\n`);
}

function startInteractshSession() {
  try {
    execFileSync('tmux', ['new-session', '-d', '-s', 'interactsh', `${INTERACTSH_CLIENT} -json -o ${INTERACTSH_LOG}`], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {}
}

async function verifyInteractsh(domain) {
  const marker = makeMarker('verify');
  const since = Date.now();
  execFileSync('curl', ['-ksS', `http://${marker}.${domain}`], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return pollForInteraction({ marker, since, timeoutMs: 15000, stepMs: 2000 });
}

async function chooseInteractshDomain() {
  const fixedDomainResult = await verifyInteractsh(DEFAULT_DOMAIN).catch(() => null);
  if (fixedDomainResult) {
    return { domain: DEFAULT_DOMAIN, source: 'provided' };
  }

  startInteractshSession();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const domain = currentInteractshDomain();
    if (domain) {
      const verified = await verifyInteractsh(domain).catch(() => null);
      if (verified) {
        return { domain, source: 'tmux' };
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(2000);
  }

  throw new Error('Unable to find a working interactsh domain');
}

function parseResult(stdout, stderr) {
  const output = `${stdout || ''}\n${stderr || ''}`;
  const matches = [...output.matchAll(/RESULT_JSON:(\{.*\})/g)];
  if (!matches.length) {
    return null;
  }
  try {
    return JSON.parse(matches.at(-1)[1]);
  } catch {
    return null;
  }
}

function tail(value, lines = 40) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-lines);
}

async function main() {
  const interactsh = await chooseInteractshDomain();
  const collaboratorCompatible = /(?:^|\.)burpcollaborator\.net$/i.test(interactsh.domain) || /(?:^|\.)oastify\.com$/i.test(interactsh.domain);
  const results = {
    startedAt: new Date().toISOString(),
    interactshDomain: interactsh.domain,
    interactshSource: interactsh.source,
    interactshLog: INTERACTSH_LOG,
    labs: [],
  };
  writeResults(results);

  for (const lab of LABS) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();

    if (!collaboratorCompatible && lab.key !== 'host-header3') {
      results.labs.push({
        key: lab.key,
        title: lab.title,
        script: lab.script,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        exitCode: null,
        signal: null,
        solved: false,
        blocked: true,
        note: OOB_BLOCKER_NOTE,
        stdoutTail: [],
        stderrTail: [],
      });
      writeResults(results);
      continue;
    }

    const child = spawnSync('node', [lab.script], {
      cwd: '/home/jclee/dev/bug',
      encoding: 'utf8',
      env: {
        ...process.env,
        INTERACTSH_DOMAIN: interactsh.domain,
        INTERACTSH_LOG,
      },
      timeout: 900000,
      maxBuffer: 1024 * 1024 * 8,
    });

    const entry = {
      key: lab.key,
      title: lab.title,
      script: lab.script,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      exitCode: child.status,
      signal: child.signal,
      solved: child.status === 0 && /\bSOLVED\b/.test(`${child.stdout}\n${child.stderr}`),
      result: parseResult(child.stdout, child.stderr),
      stdoutTail: tail(child.stdout),
      stderrTail: tail(child.stderr),
    };

    results.labs.push(entry);
    writeResults(results);
  }

  results.finishedAt = new Date().toISOString();
  results.solved = results.labs.filter((lab) => lab.solved).length;
  results.total = LABS.length;
  writeResults(results);
  console.log(`SOLVED ${results.solved}/${results.total}`);
  process.exitCode = results.solved === results.total ? 0 : 1;
}

main().catch((error) => {
  const results = {
    startedAt: new Date().toISOString(),
    interactshDomain: '',
    interactshSource: 'error',
    interactshLog: INTERACTSH_LOG,
    labs: [],
    error: String(error.stack || error),
  };
  writeResults(results);
  console.error(error.stack || error);
  process.exit(1);
});
