<h1 id="resellerclub-and-stripe-gateway-integration-with-cloudflare-workers">Resellerclub and Stripe Gateway Integration
    with Cloudflare Workers</h1>
<p>This repository demonstrates how to integrate <strong>Stripe Payments</strong> with <strong>Cloudflare
        Workers</strong> using <strong>KV storage</strong> for securely managing keys, and submitting transactions to
    <strong>Resellerclub</strong>. It includes both the front-end (payment form with Stripe Elements) and back-end logic
    (payment intent creation, checksum generation, and form submission).</p>
<h2 id="features">Features</h2>
<ul>
    <li><strong>Stripe Payment Integration</strong>: Accept payments securely using Stripe&#39;s Payment Elements.</li>
    <li><strong>Checksum Validation</strong>: Secure your transactions by generating and validating checksums using MD5
        hashing.</li>
    <li><strong>Cloudflare Workers</strong>: Serverless backend to handle payments and checksum generation.</li>
    <li><strong>Resellerclub Integration</strong>: Submit payment data to Resellerclub with the required parameters
        after confirming payment.</li>
</ul>
<h2 id="getting-started">Getting Started</h2>
<h3 id="1-fork-the-repository">1. Fork the Repository</h3>
<ol>
    <li>
        <p>Fork this repository to your GitHub account.</p>
    </li>
    <li>
        <p>Clone the repository to your local machine:
            <code>git clone https://github.com/JamesShaver/stripepayments.git</code>
            <code>cd stripepayments</code>
        </p>
    </li>
</ol>
<h3 id="2-set-up-cloudflare-workers">2. Set Up Cloudflare Workers</h3>
<ol>
    <li>
        <p>Install the Cloudflare CLI tool <code>wrangler</code>:
            <code>npm install -g wrangler</code>
        </p>
    </li>
    <li>
        <p>Authenticate <code>wrangler</code> with your Cloudflare account:
            <code>wrangler login</code>
        </p>
    </li>
    <li>
        <p>Create a new Worker project if you don&#39;t have one already:
            <code>wrangler init</code>
        </p>
    </li>
    <li>
        <p>Modify the <code>wrangler.toml</code> file to match your Cloudflare Worker project settings. Here&#39;s an
            example:</p>
    </li>
</ol>
<pre><code>```
<span class="hljs-attr">name</span> = <span class="hljs-string">"stripe-cloudflare-worker"</span>
<span class="hljs-attr">type</span> = <span class="hljs-string">"javascript"</span>
<span class="hljs-attr">account_id</span> = <span class="hljs-string">"&lt;your-cloudflare-account-id&gt;"</span>
<span class="hljs-attr">workers_dev</span> = <span class="hljs-literal">true</span>
<span class="hljs-attr">kv_namespaces</span> = [
  { <span class="hljs-attr">binding</span> = <span class="hljs-string">"KV"</span>, <span class="hljs-attr">id</span> = <span class="hljs-string">"&lt;your-kv-namespace-id&gt;"</span> }
]
```
</code></pre>
<ol>
    <li>Add the necessary KV storage entries to your Cloudflare KV namespace. These entries will be used for securely
        storing Stripe API keys and your payment gateway key:</li>
</ol>
<p><code>wrangler kv:key put --binding=KV STRIPE_TEST_PUBLIC &quot;&lt;your-stripe-public-key&gt;&quot;</code>
    <code>wrangler kv:key put --binding=KV STRIPE_TEST_SECRET &quot;&lt;your-stripe-secret-key&gt;&quot;</code>
    <code>wrangler kv:key put --binding=KV RC_PAYMENT_GATEWAY_KEY &quot;&lt;your-resellerclub-payment-gateway-key&gt;&quot;</code>
</p>
<h3 id="3-deploy-the-cloudflare-worker">3. Deploy the Cloudflare Worker</h3>
<p>Once you&#39;ve configured the KV storage and set up your <code>wrangler.toml</code>, you can deploy the worker:</p>
<p><code>wrangler publish</code></p>
<p>This will deploy your Worker to Cloudflare. Make sure to copy the deployed URL, as you will use it in the next steps.
</p>
<h3 id="4-test-integration-with-resellerclub">4. Test Integration with Resellerclub</h3>
<p>You can now test the payment flow in <strong>Resellerclub</strong> by integrating your Worker into the Resellerclub
    platform.</p>
<h4 id="1-set-up-in-resellerclub-">1. <strong>Set up in Resellerclub</strong></h4>
<ul>
    <li>Log in to your <strong>Resellerclub</strong> account and go to the <strong>Payment Gateway Integration</strong>
        section.</li>
    <li>Enter the following details and save your changes by clicking Submit:</li>
    <li>Add your Cloudflare Worker URL as the endpoint for handling payments.
        <ul>
            <li><strong>Gateway Name:</strong> This is the heading for your Payment Gateway and it will be displayed to
                your Customers / Sub-Resellers on the Payment page within a dropdown of options. You could add for
                example &quot;Stripe Payments&quot;, or &quot;VISA/MasterCard/AMEX&quot; in order to signify that your
                Customer / Sub-Reseller can pay using those modes if they select this particular option.</li>
            <li><strong>Gateway URL:</strong> This is the URL on your Cloudflare Worker to which we will redirect the
                Customer / Sub-Reseller. This is explained in detail further ahead. Currently, simply fill in some URL.
                We will change this later to the correct URL.</li>
            <li><strong>Payment Gateway Access Level for Customers / Sub-Resellers:</strong> Select appropriate Access
                Levels for your Customers / Sub-Resellers.
                <img src="https://raw.githubusercontent.com/JamesShaver/stripepayments/main/screenshots/CustomPaymentSettings.png?raw=true"
                    alt="Custom Payment Settings">
            </li>
        </ul>
    </li>
</ul>
<h4 id="2-test-payment-flow-">2. <strong>Test Payment Flow</strong></h4>
<p>Once the integration is set up in Resellerclub:</p>
<ul>
    <li>Perform a test transaction by making a payment.</li>
    <li>The transaction will redirect to the Worker, where the payment is processed via <strong>Stripe</strong>.</li>
    <li>After the payment is confirmed, the Worker will generate the checksum and redirect the user back to
        Resellerclub.</li>
</ul>
<h3 id="5-local-development">5. Local Development</h3>
<p>To test your Cloudflare Worker locally, you can use <code>wrangler</code>&#39;s development mode:
    <code>wrangler dev</code>
</p>
<p>This will run your Worker locally on <code>http://127.0.0.1:8787</code> and allow you to test it before deploying,
    though you should expect the checksum to fail as it&#39;s not going through Resellerclub.</p>
<h3 id="6-optional-setup-a-subdomain-pointing-to-your-worker">6. (Optional) Setup a subdomain pointing to your worker
</h3>
<p><strong>Understanding CNAME Records</strong></p>
<p>A CNAME (Canonical Name) record is used to create an alias for a domain name. It essentially points a subdomain to
    another domain or subdomain. While this step is optional, it does provide peace of mind to your customers that your
    payment platform is reputable.</p>
<p><strong>Steps to Create a CNAME Record</strong></p>
<ol>
    <li><strong>Access Your Domain Registrar</strong>: Log in to your domain registrar&#39;s control panel. This is
        typically where you manage your domain&#39;s DNS settings.</li>
    <li><strong>Locate DNS Settings</strong>: Find the section labeled &quot;DNS Settings,&quot; &quot;Name
        Servers,&quot; &quot;DNS Management,&quot; or something similar.</li>
    <li><strong>Create a New Record</strong>: Look for an option to add a new record. This might be labeled &quot;Add
        Record,&quot; &quot;Create Record,&quot; or something similar.</li>
    <li><strong>Choose CNAME</strong>: Select the &quot;CNAME&quot;
        record type.</li>
    <li><strong>Enter Subdomain</strong>: In the &quot;Host&quot; or &quot;Name&quot; field, enter the subdomain you want
        to create. For example, if you want to create a subdomain called &quot;payment,&quot; you would enter
        &quot;payment.&quot;</li>
    <li><strong>Enter Target Domain</strong>: In the &quot;Points to&quot; or &quot;Value&quot; field, enter the domain
        or subdomain you want the CNAME to point to. For example, if you want &quot;payment&quot; to point to
        &quot;stripepayments.yoursite.workers.dev&quot; you would enter &quot;stripepayments.yoursite.workers.dev.&quot;</li>
    <li><strong>Save or Add</strong>:
        Click the &quot;Save,&quot; &quot;Add,&quot; or similar button to create the CNAME record.</li>
</ol>
<p><strong>Important Considerations</strong></p>
<ul>
    <li><strong>CNAME Limitations</strong>: Some registrars or DNS providers may have limitations on where CNAME records
        can be used. For example, you might not be able to create a CNAME record for your root domain (e.g.,
        &quot;example.com&quot;).</li>
    <li><strong>Propagation Time</strong>: It may take some time for the CNAME record to propagate across the internet.
        This typically takes a few hours but can sometimes be faster.</li>
</ul>
<h2 id="configuration">Configuration</h2>
<p>Make sure the following environment variables are correctly set in <strong>KV Storage</strong>:</p>
<ul>
    <li><code>STRIPE_TEST_PUBLIC</code>: Your Stripe public key.</li>
    <li><code>STRIPE_TEST_SECRET</code>: Your Stripe secret key.</li>
    <li><code>RC_PAYMENT_GATEWAY_KEY</code>: The Resellerclub payment gateway key.</li>
</ul>
<h2 id="troubleshooting">Troubleshooting</h2>
<h3 id="common-issues">Common Issues</h3>
<ul>
    <li><strong>Invalid Checksum</strong>: If you&#39;re encountering an invalid checksum error, make sure the checksum
        generated by Resellerclub matches the expected checksum in your Worker. The MD5 hash must include the correct
        values in the correct order.</li>
    <li><strong>Payment Failures</strong>: If the payment fails in Stripe, ensure your Stripe API keys are correct and
        that your Stripe account is in test mode if you are testing.</li>
</ul>
<h3 id="debugging">Debugging</h3>
<ul>
    <li>Use <code>wrangler dev</code> for local testing and debugging.</li>
    <li>Use the Cloudflare dashboard&#39;s <strong>Worker Logs</strong> feature to view logs in real time if issues
        arise in production.</li>
</ul>
<h2 id="license">License</h2>
<p>This project is licensed under the MIT License. See the <a
        href="https://raw.githubusercontent.com/JamesShaver/stripepayments/main/LICENSE">LICENSE</a> file for more
    details.</p>