/** WhatsApp click-to-chat deep links (no Business API, no third-party scripts). */

export function waLink(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`; // default to India
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(phone, text) {
  const url = waLink(phone, text);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
