import { Stripe } from 'stripe';
import { GenHash, md5, safeEqual, escapeHtml, jsonForScript, toMinorUnits } from './utils.js';

// Stripe metadata values are limited to 500 characters.
const META_MAX = 500;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function loadConfig(env) {
  const [publicKey, secretKey, gatewayKey, currency, redirectHosts] = await Promise.all([
    env.kv.get('STRIPE_TEST_PUBLIC'),
    env.kv.get('STRIPE_TEST_SECRET'),
    env.kv.get('RC_PAYMENT_GATEWAY_KEY'),
    env.kv.get('RC_CURRENCY'),
    env.kv.get('RC_ALLOWED_REDIRECT_HOSTS'),
  ]);
  if (!publicKey || !secretKey || !gatewayKey || !currency) {
    // Fail closed: without these we can't verify requests or pin the currency.
    throw new Error('Missing required KV configuration (STRIPE_TEST_PUBLIC, STRIPE_TEST_SECRET, RC_PAYMENT_GATEWAY_KEY, RC_CURRENCY)');
  }
  return {
    publicKey,
    gatewayKey,
    currency: currency.trim().toLowerCase(),
    redirectHosts: (redirectHosts || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean),
    stripe: new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() }),
  };
}

// Only allow https redirect targets, optionally restricted to an allowlist of hosts.
function validateRedirectUrl(raw, allowedHosts) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase())) return null;
  if (url.href.length > META_MAX) return null;
  return url;
}

const clip = (value) => String(value ?? '').slice(0, META_MAX);

// ResellerClub signs the request it sends to the gateway URL:
// md5(paymenttypeid|transid|userid|usertype|transactiontype|invoiceids|debitnoteids|description|sellingcurrencyamount|accountingcurrencyamount|key)
function verifyResellerClubChecksum(p, key) {
  const str = [
    p.paymenttypeid, p.transid, p.userid, p.usertype, p.transactiontype,
    p.invoiceids, p.debitnoteids, p.description,
    p.sellingcurrencyamount, p.accountingcurrencyamount, key,
  ].join('|');
  return safeEqual(md5(str), (p.checksum || '').toLowerCase());
}

async function handlePaymentPage(request, config) {
  const params = new URL(request.url).searchParams;
  const p = {};
  for (const name of ['paymenttypeid', 'transid', 'userid', 'usertype', 'transactiontype', 'invoiceids',
    'debitnoteids', 'description', 'sellingcurrencyamount', 'accountingcurrencyamount', 'redirecturl', 'checksum']) {
    p[name] = params.get(name) ?? '';
  }

  if (!p.transid || !p.checksum || !verifyResellerClubChecksum(p, config.gatewayKey)) {
    throw new HttpError(403, 'Invalid request signature');
  }

  // The currency is not covered by ResellerClub's checksum, so it is pinned in
  // config; a tampered resellerCurrency parameter is rejected.
  const requestedCurrency = params.get('resellerCurrency');
  if (requestedCurrency && requestedCurrency.toLowerCase() !== config.currency) {
    throw new HttpError(400, 'Unsupported currency');
  }

  const redirectUrl = validateRedirectUrl(p.redirecturl, config.redirectHosts);
  if (!redirectUrl) throw new HttpError(400, 'Invalid redirect URL');

  const amount = toMinorUnits(p.sellingcurrencyamount, config.currency);
  if (amount === null || !/^\d{1,12}(\.\d{1,6})?$/.test(p.accountingcurrencyamount)) {
    throw new HttpError(400, 'Invalid amount');
  }

  // Idempotency key ties one PaymentIntent to one signed ResellerClub request,
  // so reloading or replaying the link doesn't create new PaymentIntents.
  const paymentIntent = await config.stripe.paymentIntents.create({
    amount,
    currency: config.currency,
    description: p.description.slice(0, 1000) || undefined,
    // Only payment methods that complete on this page; the result is verified server-side in /complete.
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: {
      transid: clip(p.transid),
      userid: clip(p.userid),
      usertype: clip(p.usertype),
      transactiontype: clip(p.transactiontype),
      invoiceids: clip(p.invoiceids),
      debitnoteids: clip(p.debitnoteids),
      rc_sellingamount: p.sellingcurrencyamount,
      rc_accountingamount: p.accountingcurrencyamount,
      rc_redirecturl: redirectUrl.href,
    },
  }, { idempotencyKey: `rc:${p.paymenttypeid}:${p.transid}:${p.checksum}`.slice(0, 255) });

  const nonce = GenHash(24);
  const pageConfig = { publishableKey: config.publicKey, clientSecret: paymentIntent.client_secret };
  const displayAmount = `${escapeHtml(p.sellingcurrencyamount)} ${escapeHtml(config.currency.toUpperCase())}`;

  const html = `<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Pay Securely through Stripe</title>
      <script src="https://js.stripe.com/v3/"></script>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="card-header bg-primary">
            <img src="https://cdn.brandfolder.io/KGT2DTA4/at/v5bcwzcgcmgbp3676v3rg79q/Powered_by_Stripe_-_white.png?width=220&height=50" alt="Powered by Stripe" />
          </div>
          <div class="card-body">
            <form id="payment-form">
              <div id="payment-element"></div>
              <button id="submit" class="w-100 btn btn-success mt-2" type="submit">
                <div class="d-flex">
                  <div class="me-auto p-2">
                    <span id="button-text">Pay now</span>
                  </div>
                  <div class="p-2">Amount: ${displayAmount}</div>
                </div>
              </button>
              <div id="payment-message" class="alert alert-danger mt-2 d-none" role="alert"></div>
            </form>
          </div>
        </div>
      </div>
      <script type="application/json" id="payment-config">${jsonForScript(pageConfig)}</script>
      <script nonce="${nonce}">
        const config = JSON.parse(document.getElementById('payment-config').textContent);
        const stripe = Stripe(config.publishableKey);
        const elements = stripe.elements({ clientSecret: config.clientSecret });
        const paymentElement = elements.create('payment');
        paymentElement.mount('#payment-element');

        const form = document.getElementById('payment-form');
        const submitButton = document.getElementById('submit');

        function showMessage(text) {
          const message = document.getElementById('payment-message');
          message.textContent = text;
          message.classList.remove('d-none');
        }

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          submitButton.disabled = true;

          const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: 'if_required',
          });

          if (error) {
            showMessage(error.message);
            submitButton.disabled = false;
            return;
          }

          // The server verifies the payment with Stripe and builds the signed
          // ResellerClub response; the browser never decides the status.
          let result;
          try {
            const response = await fetch('/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ payment_intent: paymentIntent.id, client_secret: config.clientSecret }),
            });
            result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Payment could not be confirmed.');
          } catch (err) {
            showMessage(err.message || 'Payment could not be confirmed.');
            return;
          }

          const redirectForm = document.createElement('form');
          redirectForm.method = 'POST';
          redirectForm.action = result.action;
          for (const [name, value] of Object.entries(result.fields)) {
            redirectForm.appendChild(createHiddenInput(name, value));
          }

          document.body.appendChild(redirectForm);
          redirectForm.submit();
        });

        function createHiddenInput(name, value) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          return input;
        }
      </script>
    </body>
    </html>`;

  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://js.stripe.com https://*.js.stripe.com`,
    "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
    "connect-src 'self' https://api.stripe.com https://*.stripe.com",
    "style-src https://cdn.jsdelivr.net 'unsafe-inline'",
    "img-src https://cdn.brandfolder.io https://*.stripe.com data:",
    `form-action ${redirectUrl.origin}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      ...commonHeaders(),
    },
  });
}

async function handleComplete(request, config) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) {
    throw new HttpError(415, 'Unsupported content type');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
  const { payment_intent: paymentIntentId, client_secret: clientSecret } = body || {};
  if (typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9]{1,250}$/.test(paymentIntentId) || typeof clientSecret !== 'string') {
    throw new HttpError(400, 'Invalid request');
  }

  let pi;
  try {
    pi = await config.stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    throw new HttpError(404, 'Payment not found');
  }

  // Proof that the caller is the browser that was handed this PaymentIntent.
  if (!safeEqual(pi.client_secret, clientSecret)) throw new HttpError(404, 'Payment not found');

  const m = pi.metadata || {};
  if (!m.transid || !m.rc_redirecturl) throw new HttpError(404, 'Payment not found');

  if (pi.status !== 'succeeded') {
    throw new HttpError(409, pi.status === 'processing'
      ? 'Your payment is still processing. Please do not pay again.'
      : 'Payment has not been completed.');
  }

  // Defense in depth: the captured payment must match what ResellerClub asked for.
  const expectedAmount = toMinorUnits(m.rc_sellingamount, config.currency);
  if (pi.currency !== config.currency || pi.amount !== expectedAmount || pi.amount_received !== expectedAmount) {
    console.error(`Amount mismatch on ${pi.id}`);
    throw new HttpError(409, 'Payment could not be verified.');
  }

  const redirectUrl = validateRedirectUrl(m.rc_redirecturl, config.redirectHosts);
  if (!redirectUrl) throw new HttpError(409, 'Payment could not be verified.');

  const status = 'Y';
  const rkey = GenHash(32);
  const checksum = md5(`${m.transid}|${m.rc_sellingamount}|${m.rc_accountingamount}|${status}|${rkey}|${config.gatewayKey}`);

  return jsonResponse({
    action: redirectUrl.href,
    fields: {
      transid: m.transid,
      status,
      rkey,
      checksum,
      sellingamount: m.rc_sellingamount,
      accountingamount: m.rc_accountingamount,
    },
  });
}

function commonHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'strict-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...commonHeaders() },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.searchParams.has('transid')) {
        return await handlePaymentPage(request, await loadConfig(env));
      }
      if (request.method === 'POST' && url.pathname === '/complete') {
        return await handleComplete(request, await loadConfig(env));
      }
      return new Response('Not found', { status: 404, headers: commonHeaders() });
    } catch (err) {
      if (err instanceof HttpError) {
        return url.pathname === '/complete'
          ? jsonResponse({ error: err.message }, err.status)
          : new Response(err.message, { status: err.status, headers: commonHeaders() });
      }
      // Don't leak internal/Stripe error details to the client.
      console.error(err);
      return url.pathname === '/complete'
        ? jsonResponse({ error: 'An internal error occurred.' }, 500)
        : new Response('An internal error occurred.', { status: 500, headers: commonHeaders() });
    }
  },
};
