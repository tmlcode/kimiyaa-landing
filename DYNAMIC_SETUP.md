# Dynamic form setup

The site is still a fast static landing page, but the form is now dynamic because it posts to a Cloudflare Worker backend.

## Changed files

- `index.html`
  - Added `kimiyaa-api-endpoint` meta tag.
  - The form now calls the backend using `fetch()` instead of only showing a local success message.
  - Added a hidden honeypot field named `website`.
- `cloudflare-worker/`
  - New backend endpoint at `/apply`.
  - Reads EmailJS credentials from Cloudflare secrets.
  - Validates form input.
  - Sends EmailJS template variables.
  - Restricts CORS to `https://landing.kimiyaa.ai`.

## Deployment flow

1. Keep the landing page hosted on GitHub Pages.
2. Deploy `cloudflare-worker/` to Cloudflare Workers.
3. Copy the deployed Worker `/apply` URL.
4. Replace this line in `index.html`:

```html
<meta name="kimiyaa-api-endpoint" content="https://YOUR_WORKER_URL/apply" />
```

with your actual Worker endpoint.

## EmailJS template

Use these variables:

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

Set the template recipient to:

```txt
{{to_email}}
```
