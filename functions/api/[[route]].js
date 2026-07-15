/* 書齋會員後端 — Cloudflare Pages Functions
   部署即生效，但需要在 Cloudflare Pages 專案裏配置（見維護手冊「書齋」一節）：
   - KV 綁定：變數名 WJZ_KV → 一個 KV namespace
   - 環境變數：AUTH_SECRET（隨機長字符串，簽發登入令牌用）
   - 環境變數：RESEND_KEY（resend.com 的 API key，寄入館碼用）
   - 環境變數：FROM_EMAIL（寄件地址，如 xindeng@你的域名 或 onboarding@resend.dev）
   - 可選：TURNSTILE_SECRET（Cloudflare Turnstile 的 secret key，配了就強制人機驗證）
   未配置 KV 或 AUTH_SECRET 時，所有接口返回 503，前端自動退化為本地模式。

   接口：
   POST /api/code    {email, turnstile} → 寄六位入館碼（10分鐘有效，每郵箱每小時最多5次）
   POST /api/verify  {email, code}      → {token}（90天有效）
   GET  /api/data    (Bearer token)     → {favs, bookmarks, pos}
   PUT  /api/data    (Bearer token)     → 保存 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, '');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  const fail = (status, error) =>
    new Response(JSON.stringify({ error }), { status, headers });
  const ok = (obj) => new Response(JSON.stringify(obj || { ok: 1 }), { headers });

  if (!env.WJZ_KV || !env.AUTH_SECRET) return fail(503, '後端未配置');

  try {
    if (route === 'code' && request.method === 'POST') {
      const { email, turnstile } = await request.json();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) return fail(400, '郵箱格式不對');

      // 人機驗證（配置了 TURNSTILE_SECRET 才強制）
      if (env.TURNSTILE_SECRET) {
        const tv = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: env.TURNSTILE_SECRET,
            response: turnstile || '',
            remoteip: request.headers.get('CF-Connecting-IP')
          })
        }).then(r => r.json());
        if (!tv.success) return fail(403, '人機驗證未通過，請重試');
      }

      // 頻率限制：每郵箱每小時5次
      const rlKey = 'rl:' + email;
      const used = parseInt(await env.WJZ_KV.get(rlKey) || '0', 10);
      if (used >= 5) return fail(429, '請求太頻繁，一小時後再試');
      await env.WJZ_KV.put(rlKey, String(used + 1), { expirationTtl: 3600 });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.WJZ_KV.put('code:' + email, code, { expirationTtl: 600 });

      if (!env.RESEND_KEY) return fail(503, '郵件服務未配置');
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '心燈文錄 <' + (env.FROM_EMAIL || 'onboarding@resend.dev') + '>',
          to: [email],
          subject: '入館碼 ' + code + ' · 心燈文錄書齋',
          html: '<div style="font-family:serif;max-width:420px;margin:0 auto;padding:32px;border:1px solid #17130e">' +
            '<p style="letter-spacing:.3em;color:#a63a25;font-size:12px">入館登記 · XINDENG WENLU</p>' +
            '<h1 style="letter-spacing:.2em">書齋</h1>' +
            '<p>您的入館碼（十分鐘內有效）：</p>' +
            '<p style="font-size:34px;letter-spacing:.4em;font-weight:bold">' + code + '</p>' +
            '<p style="color:#777;font-size:12px">若非本人操作，忽略此信即可。</p></div>'
        })
      });
      if (!mail.ok) {
        const err = await mail.text();
        return fail(502, '寄信失敗：' + err.slice(0, 120));
      }
      return ok();
    }

    if (route === 'verify' && request.method === 'POST') {
      const { email, code } = await request.json();
      const saved = await env.WJZ_KV.get('code:' + email);
      if (!saved || saved !== String(code)) return fail(401, '入館碼不對或已過期');
      await env.WJZ_KV.delete('code:' + email);
      const exp = Date.now() + 1000 * 3600 * 24 * 90;
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ e: email, x: exp }))));
      const sig = await hmac(env.AUTH_SECRET, payload);
      return ok({ token: payload + '.' + sig });
    }

    if (route === 'data') {
      const email = await authEmail(request, env);
      if (!email) return fail(401, '未入館或令牌過期');
      const key = 'data:' + email;
      if (request.method === 'GET') {
        const d = await env.WJZ_KV.get(key);
        return ok(d ? JSON.parse(d) : { favs: [], bookmarks: {}, pos: {} });
      }
      if (request.method === 'PUT') {
        const body = await request.text();
        if (body.length > 200000) return fail(413, '數據過大');
        JSON.parse(body); // 驗證合法
        await env.WJZ_KV.put(key, body);
        return ok();
      }
    }

    return fail(404, '無此接口');
  } catch (e) {
    return fail(500, String(e.message || e).slice(0, 120));
  }
}

async function authEmail(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/, '');
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (await hmac(env.AUTH_SECRET, payload) !== sig) return null;
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(payload))));
    if (d.x < Date.now()) return null;
    return d.e;
  } catch (e) { return null; }
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
