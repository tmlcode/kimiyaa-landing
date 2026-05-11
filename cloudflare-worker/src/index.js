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
    adminEmail: clean(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL, 300),
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
  studio,
  role,
  size,
  email,
  submittedAt,
  name = 'Not provided from landing page',
  appName = 'Not applicable',
  downloadFile = 'Not applicable',
  downloadLink = 'Not applicable',
  product = 'Kimiyaa.ai Landing Page',
  platform = 'Web',
  requestType = 'Pilot application',
  source = 'landing.kimiyaa.ai pilot form',
  message = '',
}) {
  const finalMessage =
    message ||
    `New Kimiyaa pilot application\n\nName: ${name}\nStudio: ${studio}\nRole: ${role}\nStudio size: ${size}\nEmail: ${email}\nSubmitted at: ${submittedAt}`;

  return {
    // EmailJS routing fields.
    // Use {{to_email}} for the admin template recipient if you do not hardcode it in EmailJS.
    // Use {{email}} for the auto-reply recipient.
    to_email: adminEmail,
    admin_email: adminEmail,
    user_email: email,
    from_email: email,
    reply_to: email,
    email,

    // Shared template fields used by both landing and file website.
    request_type: requestType,
    studio,
    studio_name: studio,
    company: studio,
    company_name: studio,

    role,
    user_role: role,

    size,
    studio_size: size,
    seats: size,

    name,
    user_name: name,
    to_name: name,

    app_name: appName,
    download_file: downloadFile,
    download_link: downloadLink,
    product,
    platform,

    submitted_at: submittedAt,
    submittedAt,
    source,
    message: finalMessage,

    subject: 'New Kimiyaa pilot application',
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
          studio,
          role,
          size,
          email,
          submittedAt,
          name,
          appName: 'Not applicable',
          downloadFile: 'Not applicable',
          downloadLink: 'Not applicable',
          product: 'Kimiyaa.ai Landing Page',
          platform: 'Web',
          requestType: 'Pilot application',
          source: 'landing.kimiyaa.ai pilot form',
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
