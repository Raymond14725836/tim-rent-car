import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const equals = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createShareGate({ code, origin, upstreamPort, sessionMs = 12 * 60 * 60 * 1000 }) {
  if (!code || code.length < 20) throw Error('A strong demo access code is required');
  const cookieName = '__Host-tim_demo';
  const session = randomBytes(32).toString('hex');
  const expires = Date.now() + sessionMs;
  const failures = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const publicOrigin = origin();
    if (!publicOrigin) { res.writeHead(503); res.end('Demo is starting'); return; }
    if (req.headers.host !== new URL(publicOrigin).host) { res.writeHead(403); res.end('Invalid host'); return; }
    const path = new URL(req.url, publicOrigin).pathname;
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
    const authorized = Date.now() < expires && equals(cookie, session);
    if (path === '/__demo/unlock' && req.method === 'POST') {
      if (req.headers.origin !== publicOrigin || !String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')) { console.warn('Demo unlock rejected', JSON.stringify({origin:req.headers.origin,contentType:req.headers['content-type'],expectedOrigin:publicOrigin})); res.writeHead(403); res.end('Invalid origin or form'); return; }
      const key = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress);
      const now = Date.now();
      for (const [k, v] of failures) if (v.until < now) failures.delete(k);
      const record = failures.get(key) || { count: 0, until: now + 600000 };
      if (record.count >= 10 || failures.size >= 2000) { res.writeHead(429, {'Retry-After': '600'}); res.end('Too many attempts. Try again later.'); return; }
      let body = '', size = 0;
      try {
        for await (const chunk of req) { size += chunk.length; if (size > 2048) { res.writeHead(413); res.end('Form too large'); return; } body += chunk; }
      } catch { res.destroy(); return; }
      const supplied = new URLSearchParams(body).get('code') || '';
      if (Date.now() >= expires || !equals(supplied.trim(), code)) {
        record.count++; failures.set(key, record);
        res.writeHead(401, {'Content-Type':'text/html; charset=utf-8'}); res.end('<p>รหัสไม่ถูกต้องหรือหมดอายุ <a href="/">ลองอีกครั้ง</a></p>'); return;
      }
      failures.delete(key);
      res.writeHead(303, {Location:'/', 'Set-Cookie':`${cookieName}=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.max(0, Math.floor((expires-Date.now())/1000))}`}); res.end(); return;
    }
    if (!authorized) {
      if (req.method !== 'GET' || path.startsWith('/api/')) { res.writeHead(401, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Demo access code required'})); return; }
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      res.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>เข้าเดโม | Tim Rent Car</title><style>body{font:17px system-ui,sans-serif;background:#f3f6fc;color:#14233c;margin:0;display:grid;min-height:100vh;place-items:center}main{background:white;border:1px solid #dce4f1;border-radius:18px;padding:30px;width:min(380px,80vw)}label,input,button{display:block;box-sizing:border-box;width:100%}input,button{font:inherit;border-radius:9px;padding:13px;margin-top:12px}input{border:1px solid #bac7dd}button{border:0;background:#245bf0;color:white}p{line-height:1.7;color:#52627c}small{overflow-wrap:anywhere}</style><main><h1>Tim Rent Car</h1><p>ใส่รหัสเข้าเดโมที่เจ้าของระบบส่งให้ ก่อนเข้าสู่บัญชีทดสอบ</p><form action="/__demo/unlock" method="post"><label for="code">รหัสเข้าเดโม</label><input id="code" name="code" type="password" required autocomplete="off" maxlength="128"><button>เข้าเดโม</button></form><p>ใช้ข้อมูลตัวอย่างและการชำระเงินทดสอบเท่านั้น</p><small>${escape(new URL(publicOrigin).host)}</small></main></html>`); return;
    }
    if (path.startsWith('/__demo/')) { res.writeHead(404); res.end(); return; }
    const headers = {...req.headers, 'x-forwarded-proto':'https'};
    delete headers.connection;
    headers.cookie = String(headers.cookie || '').split(';').filter(x => !x.trim().startsWith(cookieName+'=')).join(';');
    const upstream = http.request({hostname:'127.0.0.1', port:upstreamPort, path:req.url, method:req.method, headers, timeout:30000}, response => {
      res.writeHead(response.statusCode, {...response.headers, 'cache-control':'no-store'});
      response.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(Error('Origin timed out')));
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Demo is temporarily unavailable'); });
    req.pipe(upstream);
    res.on('close', () => upstream.destroy());
  });
}
