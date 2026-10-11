/** WhatsApp click-to-chat deep links (no Business API, no third-party scripts). */

/** Why a chat could not be opened, as a sentence for the user (null = fine). */
export function whatsappProblem(phone) {
  const raw = String(phone || '');
  if (raw.includes('*')) return 'This customer\'s number is hidden for your role, so WhatsApp cannot be opened.';
  if (raw.replace(/\D/g, '').length < 10) return 'No usable mobile number is available for this customer (it may be hidden for your role).';
  return null;
}

export function waLink(phone, text) {
  if (whatsappProblem(phone)) return '';   // masked / missing: never build a link from partial digits
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`; // default to India
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Opens the chat, or tells the user (via the app's toast) why it cannot. Returns whether it opened. */
export function openWhatsApp(phone, text) {
  const problem = whatsappProblem(phone);
  if (problem) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('erp:notify', { detail: problem }));
    return false;
  }
  window.open(waLink(phone, text), '_blank', 'noopener,noreferrer');
  return true;
}
