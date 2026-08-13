export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://localhost`);
    const code = url.searchParams.get('code');
    const stateB64 = url.searchParams.get('state');

    if (!code) {
      res.statusCode = 400;
      return res.end('Missing code');
    }

    // State should be a base64-encoded JSON containing origin, appName, supabaseUrl, supabaseAnonKey
    let state = null;
    try {
      state = stateB64 ? JSON.parse(Buffer.from(stateB64, 'base64').toString('utf8')) : null;
    } catch (e) {
      // ignore
    }

    const redirectUri = (process.env.VITE_GOOGLE_AUTH_PROXY || process.env.GOOGLE_AUTH_PROXY || '').toString();
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[google-auth-proxy] Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or VITE_GOOGLE_AUTH_PROXY');
      res.statusCode = 500;
      return res.end('Server not configured');
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const tokens = await tokenResp.json();

    // Build a small HTML page that posts the tokens back to the opener window and closes.
    const targetOrigin = (state && state.origin) ? state.origin : '*';

    const payload = {
      type: tokenResp.ok ? 'google-auth-success' : 'google-auth-denied',
      ...tokens,
    };

    const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Google Auth</title></head>
  <body>
    <script>
      (function(){
        try {
          var opener = window.opener;
          var payload = ${JSON.stringify(payload)};
          var origin = ${JSON.stringify(targetOrigin)};
          if (opener && opener.postMessage) {
            opener.postMessage(payload, origin || '*');
            try { window.close(); } catch(e) { document.body.innerText = 'Authentication complete — you can close this window.'; }
          } else {
            document.body.innerText = 'Authentication complete. You may close this window.';
          }
        } catch (err) {
          document.body.innerText = 'Authentication failed.';
        }
      })();
    </script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.statusCode = 200;
    res.end(html);
  } catch (err) {
    console.error('[google-auth-proxy] error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
}
