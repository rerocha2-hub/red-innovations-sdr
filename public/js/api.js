// Tiny fetch wrapper used by all pages.
export async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(pathname, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `Erro ${res.status}`);
  }
  return data;
}

export function showAlert(el, message, type = 'error') {
  el.className = `alert ${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
}

export function money(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
