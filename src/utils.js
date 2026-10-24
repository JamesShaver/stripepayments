import SparkMD5 from "spark-md5";

const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Random alphanumeric string. Uses rejection sampling so every character is
// equally likely (a plain `byte % 62` is biased toward the first 8 chars).
export function GenHash(length) {
  const limit = 256 - (256 % CHARSET.length);
  let out = '';
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit) out += CHARSET[b % CHARSET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function md5(str) {
  return SparkMD5.hash(str);
}

// Constant-time string comparison so secrets/checksums can't be guessed by timing.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON that is safe to embed inside a <script> element.
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
// https://docs.stripe.com/currencies#three-decimal
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

// Convert a decimal amount string (e.g. "12.99") to Stripe's smallest currency
// unit without floating point. Any sub-unit remainder rounds UP so the
// customer is never undercharged. Returns null for malformed input.
export function toMinorUnits(amount, currency) {
  if (typeof amount !== 'string' || !/^\d{1,12}(\.\d{1,6})?$/.test(amount)) return null;
  const digits = ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2;
  const [intPart, fracPart = ''] = amount.split('.');
  const kept = fracPart.slice(0, digits).padEnd(digits, '0');
  const rest = fracPart.slice(digits);
  let minor = BigInt(intPart + kept);
  if (/[1-9]/.test(rest)) minor += 1n;
  // Stripe requires three-decimal currency amounts to end in 0.
  if (digits === 3 && minor % 10n !== 0n) minor += 10n - (minor % 10n);
  if (minor <= 0n || minor > 99999999n) return null;
  return Number(minor);
}
