import SparkMD5 from "spark-md5";
import { Stripe } from 'stripe';
import { GenHash } from './utils.js';

async function handleRequest(request) {
  const stripe_test_public = await kv.get('STRIPE_TEST_PUBLIC');
  const stripe_test_secret = await kv.get('STRIPE_TEST_SECRET');
  const rc_payment_gateway_key = await kv.get('RC_PAYMENT_GATEWAY_KEY');
  const stripe = new Stripe(stripe_test_secret);

  const url = new URL(request.url);

  if (request.method === 'GET') {
    // Handle the GET request to display the payment form
    const params = url.searchParams;

    // Extract GET parameters
    const transid = params.get('transid');
    const sellingcurrencyamount = params.get('sellingcurrencyamount');
    const accountingcurrencyamount = params.get('accountingcurrencyamount');
    const redirecturl = params.get('redirecturl');
    const resellercurrency = params.get('resellerCurrency');
    const description = params.get('description');
    const userid = params.get('userid');
    const usertype = params.get('usertype');
    const transactiontype = params.get('transactiontype');
    const invoiceids = params.get('invoiceids');
    const debitnoteids = params.get('debitnoteids');

    // Generate a Stripe Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(sellingcurrencyamount, 10) * 100, // Convert to smallest currency unit
      currency: resellercurrency,
      description: description,
      automatic_payment_methods: { enabled: true },
      metadata: {
        transid: transid,
        userid: userid,
        usertype: usertype,
        transactiontype: transactiontype,
        invoiceids: invoiceids,
        debitnoteids: debitnoteids,
      },
    });

    // Generate a random key (rkey) for the form
    const rkey = GenHash(32);

    // Serve the HTML payment page
    return new Response(`<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Pay Securely through Stripe</title>
      <script src="https://js.stripe.com/v3/"></script>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" crossorigin="anonymous">
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="card-header bg-primary">
            <img src="https://cdn.brandfolder.io/KGT2DTA4/at/v5bcwzcgcmgbp3676v3rg79q/Powered_by_Stripe_-_white.png?width=220&height=50" />
          </div>
          <div class="card-body">
            <form id="payment-form">
              <div id="payment-element"></div>
              <button id="submit" class="w-100 btn btn-success mt-2" type="submit">
                <div class="d-flex">
                  <div class="me-auto p-2"><div class="spinner hidden" id="spinner"></div>
                    <span id="button-text">Pay now</span>
                  </div>
                  <div class="p-2">Amount: ${parseFloat(sellingcurrencyamount).toFixed(2)} ${resellercurrency.toUpperCase()}</div>
                </div>
              </button>
              <div id="payment-message" class="hidden"></div>
            </form>
          </div>
        </div>
      </div>
      <script>
        const stripe = Stripe('${stripe_test_public}');
        const elements = stripe.elements({ clientSecret: '${paymentIntent.client_secret}' });
        const paymentElement = elements.create('payment');
        paymentElement.mount('#payment-element');

        const form = document.getElementById('payment-form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          document.getElementById('submit').disabled = true;

          const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: 'if_required',
          });

          let status = 'N'; // Default to 'N' for failure

          if (!error && paymentIntent && paymentIntent.status === 'succeeded') {
            status = 'Y'; // Payment success
          } else if (error) {
            document.getElementById('payment-status').textContent = error.message;
            document.getElementById('submit').disabled = false;
            return;
          }

          // Send a POST request to the backend to calculate the checksum
          const response = await fetch('/calculate-checksum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transid: '${transid}',
              sellingamount: '${sellingcurrencyamount}',
              accountingamount: '${accountingcurrencyamount}',
              status: status, // Final payment status
              rkey: '${rkey}', // rkey from server
            }),
          });

          const result = await response.json();
          const generatedChecksum = result.checksum;

          // Dynamically create and submit the form to the redirect URL
          const redirectForm = document.createElement('form');
          redirectForm.method = 'POST';
          redirectForm.action = '${redirecturl}';

          // Add hidden inputs to the form
          redirectForm.appendChild(createHiddenInput('transid', '${transid}'));
          redirectForm.appendChild(createHiddenInput('status', status));
          redirectForm.appendChild(createHiddenInput('rkey', '${rkey}'));
          redirectForm.appendChild(createHiddenInput('checksum', generatedChecksum));
          redirectForm.appendChild(createHiddenInput('sellingamount', '${sellingcurrencyamount}'));
          redirectForm.appendChild(createHiddenInput('accountingamount', '${accountingcurrencyamount}'));

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
    </html>`, { headers: { 'Content-Type': 'text/html' } });
  } else if (request.method === 'POST' && url.pathname === '/calculate-checksum') {
    // Handle the POST request for checksum calculation
    const requestData = await request.json();
    const { transid, sellingamount, accountingamount, status, rkey } = requestData;

    // Get the payment gateway key
    const rc_payment_gateway_key = await kv.get('RC_PAYMENT_GATEWAY_KEY');

    // Generate the postString and calculate the checksum
    const postString = `${transid}|${sellingamount}|${accountingamount}|${status}|${rkey}|${rc_payment_gateway_key}`;
    const generatedChecksum = SparkMD5.hash(postString);

    // Return the checksum in the response
    return new Response(JSON.stringify({ checksum: generatedChecksum }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    return new Response('Method not allowed', { status: 405 });
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});