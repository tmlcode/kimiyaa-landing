function json(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function clean(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function getAllowedOrigins(env) {
  const primary = env.ALLOWED_ORIGIN || 'https://landing.kimiyaa.ai';
  const extra = (env.EXTRA_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return [primary, ...extra];
}

async function sendEmailJs(env, params) {
  const payload = {
    service_id: env.EMAILJS_SERVICE_ID,
    template_id: env.EMAILJS_TEMPLATE_ID,
    user_id: env.EMAILJS_PUBLIC_KEY,
    template_params: params,
  };

  if (env.EMAILJS_ACCESS_TOKEN) {
    payload.accessToken = env.EMAILJS_ACCESS_TOKEN;
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`EmailJS failed with ${response.status}: ${text}`);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = getAllowedOrigins(env);
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    if (request.method === 'OPTIONS') {
      return json({ ok: true }, 204, corsOrigin);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/apply') {
      return json({ ok: false, error: 'Not found' }, 404, corsOrigin);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, corsOrigin);
    }

    if (origin && !allowedOrigins.includes(origin)) {
      return json({ ok: false, error: 'Origin not allowed' }, 403, corsOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400, corsOrigin);
    }

    // Honeypot field. Real users never fill this.
    if (clean(body.website, 200)) {
      return json({ ok: true }, 200, corsOrigin);
    }

    const studio = clean(body.studio, 160);
    const role = clean(body.role, 120);
    const size = clean(body.size, 80);
    const email = clean(body.email, 160).toLowerCase();

    if (!studio || !role || !size || !isValidEmail(email)) {
      return json({ ok: false, error: 'Please fill all required fields correctly.' }, 400, corsOrigin);
    }

    if (!env.EMAILJS_SERVICE_ID || !env.EMAILJS_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY) {
      return json({ ok: false, error: 'Email service is not configured.' }, 500, corsOrigin);
    }

    const submittedAt = new Date().toISOString();

    try {
      await sendEmailJs(env, {
        to_email: email,
        reply_to: email,
        email,
        studio,
        role,
        size,
        submitted_at: submittedAt,
        source: 'landing.kimiyaa.ai pilot form',
      });

      return json({ ok: true }, 200, corsOrigin);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: 'Email delivery failed. Please try again.' }, 502, corsOrigin);
    }
  },
};
