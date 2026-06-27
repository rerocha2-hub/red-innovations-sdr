import { api, money } from '/js/api.js';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
let me = null;

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

async function loadMe() {
  try {
    me = await api('/api/auth/me');
  } catch {
    window.location.href = '/login.html';
    return;
  }
  document.getElementById('biz-name').textContent = me.name;
  document.getElementById('booking-url').textContent = me.bookingUrl;
  document.getElementById('view-booking').href = me.bookingUrl;

  const trial = new Date(me.trialEndsAt);
  let planLine = '';
  if (me.planStatus === 'active') planLine = '✓ Assinatura ativa';
  else if (me.planStatus === 'trialing' && me.subscriptionActive) {
    const days = Math.ceil((trial - Date.now()) / 86400000);
    planLine = `Teste grátis — ${days} dia(s) restante(s)`;
  } else planLine = '⚠ Período de teste encerrado';
  document.getElementById('plan-line').textContent = planLine;

  if (!me.subscriptionActive) {
    document.getElementById('banner').innerHTML =
      '<div class="alert warn">Seu período de teste acabou. Assine para voltar a receber agendamentos. Veja a aba <strong>Assinatura</strong>.</div>';
  }
}

async function loadStats() {
  const s = await api('/api/appointments/stats/summary');
  document.getElementById('stat-upcoming').textContent = s.upcoming;
  document.getElementById('stat-total').textContent = s.total;
  document.getElementById('stat-revenue').textContent = money(s.revenueCents);
}

async function loadAppointments() {
  const rows = await api('/api/appointments');
  const body = document.getElementById('appts-body');
  const table = document.getElementById('appts-table');
  const empty = document.getElementById('appts-empty');
  body.innerHTML = '';
  if (!rows.length) {
    table.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  table.classList.remove('hidden');
  for (const a of rows) {
    const tr = document.createElement('tr');
    const contact = a.customer_email || a.customer_phone || '—';
    tr.innerHTML = `
      <td>${fmtWhen(a.starts_at)}</td>
      <td>${escapeHtml(a.customer_name)}</td>
      <td>${escapeHtml(a.service_name)}</td>
      <td>${escapeHtml(contact)}</td>
      <td><span class="tag ${a.status}">${a.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}</span></td>
      <td>${a.status === 'confirmed' ? `<button class="btn danger sm" data-cancel="${a.id}">Cancelar</button>` : ''}</td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar este agendamento?')) return;
      await api(`/api/appointments/${btn.dataset.cancel}/cancel`, { method: 'PATCH' });
      await Promise.all([loadAppointments(), loadStats()]);
    });
  });
}

async function loadServices() {
  const rows = await api('/api/services');
  const body = document.getElementById('svc-body');
  body.innerHTML = '';
  for (const s of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${s.duration_min} min</td>
      <td>${money(s.price_cents)}</td>
      <td><span class="tag ${s.active ? 'confirmed' : 'canceled'}">${s.active ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <button class="btn ghost sm" data-toggle="${s.id}" data-active="${s.active}">${s.active ? 'Desativar' : 'Ativar'}</button>
        <button class="btn danger sm" data-del="${s.id}">Excluir</button>
      </td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api(`/api/services/${btn.dataset.toggle}`, {
        method: 'PATCH',
        body: { active: btn.dataset.active === '1' ? 0 : 1 },
      });
      loadServices();
    }),
  );
  body.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este serviço?')) return;
      await api(`/api/services/${btn.dataset.del}`, { method: 'DELETE' });
      loadServices();
    }),
  );
}

document.getElementById('svc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/services', {
    method: 'POST',
    body: {
      name: document.getElementById('svc-name').value,
      duration_min: Number(document.getElementById('svc-dur').value),
      price_cents: Math.round(Number(document.getElementById('svc-price').value) * 100),
    },
  });
  e.target.reset();
  document.getElementById('svc-dur').value = 30;
  document.getElementById('svc-price').value = 0;
  loadServices();
});

async function loadHours() {
  const rows = await api('/api/availability');
  const byDay = {};
  for (const r of rows) byDay[r.weekday] = r;
  const form = document.getElementById('hours-form');
  form.innerHTML = '';
  for (let d = 0; d < 7; d++) {
    const open = byDay[d];
    const row = document.createElement('div');
    row.className = 'field-row';
    row.style.cssText = 'align-items:center; margin-bottom:8px;';
    row.innerHTML = `
      <div style="flex:0 0 150px;">
        <label style="margin:0; display:flex; align-items:center; gap:8px;">
          <input type="checkbox" style="width:auto;" data-day="${d}" ${open ? 'checked' : ''} />
          ${WEEKDAYS[d]}
        </label>
      </div>
      <div><input type="time" data-start="${d}" value="${open ? open.start_time : '09:00'}" /></div>
      <div><input type="time" data-end="${d}" value="${open ? open.end_time : '18:00'}" /></div>`;
    form.appendChild(row);
  }
}

document.getElementById('save-hours').addEventListener('click', async () => {
  const hours = [];
  for (let d = 0; d < 7; d++) {
    const checked = document.querySelector(`[data-day="${d}"]`).checked;
    if (!checked) continue;
    hours.push({
      weekday: d,
      start_time: document.querySelector(`[data-start="${d}"]`).value,
      end_time: document.querySelector(`[data-end="${d}"]`).value,
    });
  }
  try {
    await api('/api/availability', { method: 'PUT', body: { hours } });
    const saved = document.getElementById('hours-saved');
    saved.classList.remove('hidden');
    setTimeout(() => saved.classList.add('hidden'), 2000);
  } catch (err) {
    alert(err.message);
  }
});

async function loadPlan() {
  const detail = document.getElementById('plan-detail');
  const actions = document.getElementById('plan-actions');
  const note = document.getElementById('stripe-note');
  const status = await api('/api/billing/status');

  if (me.planStatus === 'active') {
    detail.textContent = 'Sua assinatura está ativa. Obrigado! 🎉';
    actions.innerHTML = '';
  } else {
    detail.innerHTML = me.subscriptionActive
      ? `Você está no período de teste. Plano: <strong>${me.planPriceLabel}</strong>.`
      : `Seu teste acabou. Assine por <strong>${me.planPriceLabel}</strong> para reativar.`;
    actions.innerHTML = `<button class="btn" id="subscribe">Assinar agora — ${me.planPriceLabel}</button>`;
    document.getElementById('subscribe').addEventListener('click', async (e) => {
      e.target.disabled = true;
      const { url } = await api('/api/billing/checkout', { method: 'POST' });
      window.location.href = url;
    });
  }
  note.textContent = status.stripeEnabled
    ? 'Pagamento processado com segurança via Stripe.'
    : 'Modo demonstração: o Stripe não está configurado, então a assinatura é ativada localmente para teste.';
}

// Tabs
document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  }),
);

document.getElementById('copy-link').addEventListener('click', async () => {
  await navigator.clipboard.writeText(me.bookingUrl);
  const btn = document.getElementById('copy-link');
  btn.textContent = 'Copiado!';
  setTimeout(() => (btn.textContent = 'Copiar'), 1500);
});

document.getElementById('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

// Show billing return messages.
const params = new URLSearchParams(location.search);
if (params.get('billing') === 'success' || params.get('billing') === 'stub-activated') {
  document.getElementById('banner').innerHTML =
    '<div class="alert ok">Assinatura ativada com sucesso! 🎉</div>';
}

await loadMe();
await Promise.all([loadStats(), loadAppointments(), loadServices(), loadHours(), loadPlan()]);
