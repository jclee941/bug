const { execFileSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

const DEFAULT_LOG_FILE = process.env.INTERACTSH_LOG || '/tmp/interactsh.log';
const INTERACTSH_DOMAIN_RE = /[a-z0-9]+\.(?:oast\.online|oast\.pro|oast\.fun|oast\.live|oast\.site)/gi;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireInteractshDomain() {
  const domain = String(process.env.INTERACTSH_DOMAIN || '').trim().toLowerCase();
  if (!domain) {
    throw new Error('Set INTERACTSH_DOMAIN env var');
  }
  return domain;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeMarker(prefix) {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${randomPart}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function readEntries(logFile = DEFAULT_LOG_FILE) {
  if (!existsSync(logFile)) {
    return [];
  }

  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function entryTimestamp(entry) {
  const timestamp = Date.parse(entry?.timestamp || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function entryTexts(entry) {
  return [
    entry?.['full-id'],
    entry?.['q-name'],
    entry?.hostname,
    entry?.['raw-request'],
    entry?.['raw-response'],
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function entryContains(entry, value) {
  const needle = String(value || '').toLowerCase();
  return entryTexts(entry).some((text) => text.includes(needle));
}

async function pollForInteraction({ marker, since = Date.now(), timeoutMs = 90000, stepMs = 2000, logFile = DEFAULT_LOG_FILE }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const entries = readEntries(logFile)
      .filter((entry) => entryTimestamp(entry) >= since - 1000)
      .reverse();
    const match = entries.find((entry) => entryContains(entry, marker));
    if (match) {
      return match;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(stepMs);
  }
  return null;
}

function extractLabelBeforeMarker(entry, marker, domain) {
  const domainValue = String(domain || '').toLowerCase();
  const markerValue = String(marker || '').toLowerCase();
  const candidates = [
    domainValue,
    domainValue.split('.').slice(0, 2).join('.'),
    domainValue.split('.')[0],
  ].filter(Boolean);

  for (const text of entryTexts(entry)) {
    for (const candidate of candidates) {
      const regex = new RegExp(`([a-z0-9-]+)\\.${escapeRegExp(markerValue)}\\.${escapeRegExp(candidate)}`, 'i');
      const match = text.match(regex);
      if (match?.[1]) {
        return match[1].toLowerCase();
      }
    }
  }

  return '';
}

function cookieHeader(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function withCookieOverride(cookies, name, value) {
  const nextCookies = [];
  let replaced = false;

  for (const cookie of cookies) {
    if (cookie.name === name) {
      nextCookies.push({ ...cookie, value });
      replaced = true;
      continue;
    }
    nextCookies.push(cookie);
  }

  if (!replaced) {
    nextCookies.push({ name, value });
  }

  return nextCookies;
}

function currentInteractshDomain(sessionName = 'interactsh') {
  try {
    const output = execFileSync('tmux', ['capture-pane', '-p', '-t', sessionName, '-S', '-200'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const matches = output.match(INTERACTSH_DOMAIN_RE) || [];
    return String(matches.at(-1) || '').toLowerCase();
  } catch {
    return '';
  }
}

module.exports = {
  cookieHeader,
  currentInteractshDomain,
  extractLabelBeforeMarker,
  makeMarker,
  pollForInteraction,
  readEntries,
  requireInteractshDomain,
  sleep,
  withCookieOverride,
};
