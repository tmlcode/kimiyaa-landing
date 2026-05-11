const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const DEFAULT_ADMIN_EMAIL = 'info@kimiyaa.ai';

const corsBaseHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
};

function clean(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function csvToList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins(env) {
  const primary = clean(env.ALLOWED_ORIGIN || 'https://landing.kimiyaa.ai', 300);
  const extra = csvToList(env.EXTRA_ALLOWED_ORIGINS);
  return [primary, ...extra].filter(Boolean);
}

function getCorsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = getAllowedOrigins(env);

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  return allowedOrigins[0] || '*';
}

function corsHeaders(origin) {
  return {
    ...corsBaseHeaders,
    'Access-Control-Allow-Origin': origin,
  };
}

function preflight(origin) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function json(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function isRealAccessToken(value) {
  const token = clean(value, 300);
  if (!token) return false;

  const placeholders = new Set([
    'optional_private_access_token',
    'optional',
    'none',
    'null',
    'undefined',
    'your_private_key',
    'YOUR_PRIVATE_KEY',
  ]);

  return !placeholders.has(token);
}

function envStatus(env) {
  return {
    hasEmailJsServiceId: Boolean(clean(env.EMAILJS_SERVICE_ID, 300)),
    hasEmailJsTemplateId: Boolean(clean(env.EMAILJS_TEMPLATE_ID, 300)),
    hasEmailJsPublicKey: Boolean(clean(env.EMAILJS_PUBLIC_KEY, 300)),
    hasEmailJsAccessToken: isRealAccessToken(env.EMAILJS_ACCESS_TOKEN),
    hasAdminEmail: Boolean(clean(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL, 300)),
  };
}

function emailJsPayload(env, params) {
  const payload = {
    service_id: clean(env.EMAILJS_SERVICE_ID, 300),
    template_id: clean(env.EMAILJS_TEMPLATE_ID, 300),
    user_id: clean(env.EMAILJS_PUBLIC_KEY, 300),
    template_params: params,
  };

  if (isRealAccessToken(env.EMAILJS_ACCESS_TOKEN)) {
    payload.accessToken = clean(env.EMAILJS_ACCESS_TOKEN, 300);
  }

  return payload;
}

async function sendEmailJs(env, params) {
  const response = await fetch(EMAILJS_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailJsPayload(env, params)),
  });

  const text = await response.text().catch(() => '');

  if (!response.ok) {
    const error = new Error(`EmailJS failed with ${response.status}: ${text}`);
    error.status = response.status;
    error.emailJsResponse = text;
    throw error;
  }

  return text;
}

function getTemplateParams({
  adminEmail,
  name,
  studio,
  role,
  size,
  email,
  submittedAt,
}) {
  const finalAdminEmail = clean(adminEmail || DEFAULT_ADMIN_EMAIL, 300);
  const finalName = clean(name, 160) || 'Not provided from landing page';
  const finalStudio = clean(studio, 160) || 'Not provided';
  const finalRole = clean(role, 120) || 'Not provided';
  const finalSize = clean(size, 80) || 'Not provided';
  const finalEmail = clean(email, 160).toLowerCase();

  const finalMessage = `New Kimiyaa pilot application\n\nName: ${finalName}\nStudio: ${finalStudio}\nRole: ${finalRole}\nStudio size: ${finalSize}\nEmail: ${finalEmail}\nSubmitted at: ${submittedAt}`;

  return {
    // Routing fields.
    // Admin template To Email can use {{to_email}} or {{admin_email}}.
    // Auto-reply template To Email should use {{email}}.
    to_email: finalAdminEmail,
    admin_email: finalAdminEmail,
    user_email: finalEmail,
    from_email: finalEmail,
    reply_to: finalEmail,
    email: finalEmail,

    // Name aliases. EmailJS admin template should use {{name}}.
    name: finalName,
    user_name: finalName,
    to_name: finalName,
    from_name: finalName,
    full_name: finalName,

    // Shared template fields.
    request_type: 'Pilot application',

    // Landing fields.
    studio: finalStudio,
    studio_name: finalStudio,
    company: finalStudio,
    company_name: finalStudio,

    role: finalRole,
    user_role: finalRole,

    size: finalSize,
    studio_size: finalSize,
    seats: finalSize,

    // File/download fields. Landing does not collect these yet.
    app_name: 'Not applicable',
    download_file: 'Not applicable',
    download_link: 'Not applicable',

    product: 'Kimiyaa.ai Landing Page',
    platform: 'Web',

    submitted_at: submittedAt,
    submittedAt,
    source: 'landing.kimiyaa.ai pilot form',
    message: finalMessage,

    subject: `New Kimiyaa pilot application from ${finalName}`,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = getAllowedOrigins(env);
    const corsOrigin = getCorsOrigin(request, env);
    const debugErrors = clean(env.DEBUG_ERRORS, 20) === '1';

    if (request.method === 'OPTIONS') {
      return preflight(corsOrigin);
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json(
        {
          ok: true,
          worker: 'kimiyaa-pilot-form',
          envStatus: envStatus(env),
          allowedOrigins,
        },
        200,
        corsOrigin,
      );
    }

    if (url.pathname !== '/apply') {
      return json({ ok: false, error: 'Not found' }, 404, corsOrigin);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, corsOrigin);
    }

    if (origin && !allowedOrigins.includes(origin)) {
      return json(
        {
          ok: false,
          error: 'Origin not allowed',
          ...(debugErrors ? { receivedOrigin: origin, allowedOrigins } : {}),
        },
        403,
        corsOrigin,
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400, corsOrigin);
    }

    // Honeypot field from the landing page form.
    if (clean(body.website, 200)) {
      return json({ ok: true }, 200, corsOrigin);
    }

    const name = clean(body.name, 160);
    const studio = clean(body.studio, 160);
    const role = clean(body.role, 120);
    const size = clean(body.size, 80);
    const email = clean(body.email, 160).toLowerCase();

    if (!name || !studio || !role || !size || !isValidEmail(email)) {
      return json(
        { ok: false, error: 'Please fill all required fields correctly.' },
        400,
        corsOrigin,
      );
    }

    if (!env.EMAILJS_SERVICE_ID || !env.EMAILJS_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY) {
      return json(
        {
          ok: false,
          error: 'Email service is not configured. Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY with Wrangler secrets.',
          ...(debugErrors ? { envStatus: envStatus(env) } : {}),
        },
        500,
        corsOrigin,
      );
    }

    const submittedAt = new Date().toISOString();
    const adminEmail = clean(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL, 300);

    try {
      await sendEmailJs(
        env,
        getTemplateParams({
          adminEmail,
          name,
          studio,
          role,
          size,
          email,
          submittedAt,
        }),
      );

      return json({ ok: true }, 200, corsOrigin);
    } catch (error) {
      console.error('EmailJS delivery failed:', error);

      return json(
        {
          ok: false,
          error: debugErrors
            ? `EmailJS error ${error.status || ''}: ${error.emailJsResponse || error.message || 'Unknown error'}`.trim()
            : 'Email delivery failed. Please try again.',
          ...(debugErrors
            ? {
                emailJsStatus: error.status || null,
                emailJsResponse: error.emailJsResponse || null,
                envStatus: envStatus(env),
              }
            : {}),
        },
        502,
        corsOrigin,
      );
    }
  },
};
