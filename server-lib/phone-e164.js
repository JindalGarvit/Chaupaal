/**
 * Phone normalization for password login identifier resolution.
 * India-first defaults: bare 10-digit → +91XXXXXXXXXX.
 * Returns null when the input cannot be treated as a phone.
 */

function normalizePhoneE164(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  if (s.startsWith('+') && digits.length >= 10) return '+' + digits;
  return null;
}

module.exports = { normalizePhoneE164 };
