# Kimiyaa pilot form backend

This Cloudflare Worker receives the pilot form submission from the GitHub Pages site and sends the email through EmailJS.

## 1. Install

```bash
cd cloudflare-worker
npm install
```

## 2. Add EmailJS secrets

Use Wrangler secrets so keys are not committed to GitHub:

```bash
npx wrangler secret put EMAILJS_SERVICE_ID
npx wrangler secret put EMAILJS_TEMPLATE_ID
npx wrangler secret put EMAILJS_PUBLIC_KEY
npx wrangler secret put EMAILJS_ACCESS_TOKEN
```

`EMAILJS_ACCESS_TOKEN` is optional. Add it if your EmailJS setup uses the private access token.

## 3. EmailJS template variables

Use these variables in the EmailJS template:

```txt
{{to_email}}
{{reply_to}}
{{email}}
{{studio}}
{{role}}
{{size}}
{{submitted_at}}
{{source}}
```

For the auto-reply template, set the recipient/to field to:

```txt
{{to_email}}
```

## 4. Deploy

```bash
npm run deploy
```

After deployment, Cloudflare will show a URL like:

```txt
https://kimiyaa-pilot-form.<your-account>.workers.dev/apply
```

Copy that full `/apply` URL into the `kimiyaa-api-endpoint` meta tag in `index.html`.

## 5. Optional custom endpoint

You can also attach the Worker to a custom domain like:

```txt
https://api.kimiyaa.ai/apply
```

Then use that URL in `index.html`.
