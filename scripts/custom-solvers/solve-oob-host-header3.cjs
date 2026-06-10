const { spawnSync } = require('child_process');

const { runLab, waitForSolved } = require('./_common.cjs');

const TITLE = 'Web cache poisoning via ambiguous requests';
const PATH = '/web-security/host-header/exploiting/lab-host-header-web-cache-poisoning-via-ambiguous-requests';
const SOLVER_PATH = '/tmp/wsa-solutions/HostHeader/exploit-lab03.py';

function runPythonSolver(labUrl) {
  return spawnSync('python3', ['-u', SOLVER_PATH, '-U', labUrl], {
    encoding: 'utf8',
    timeout: 240000,
  });
}

function tail(value, lines = 20) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-lines);
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    let attempts = 0;
    let lastRun = null;

    while (attempts < 3) {
      attempts += 1;
      lastRun = runPythonSolver(labUrl);
      const solved = await waitForSolved(page, labUrl, 45000, 5000);
      if (solved) {
        console.log(`RESULT_JSON:${JSON.stringify({ attempts, stdoutTail: tail(lastRun.stdout), stderrTail: tail(lastRun.stderr) })}`);
        return;
      }
      await page.waitForTimeout(5000);
    }

    throw new Error(`Host header solver failed after ${attempts} attempts\nSTDOUT:\n${tail(lastRun?.stdout, 30).join('\n')}\nSTDERR:\n${tail(lastRun?.stderr, 30).join('\n')}`);
  },
});
