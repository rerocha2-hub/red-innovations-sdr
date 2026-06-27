import { api, money } from '/js/api.js';

let me = null;
let stages = [];
let contacts = [];

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function tomorrowStr() {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
}

/* ---------------- Modal ---------------- */
function openModal(title, bodyHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml;
  $('modal-backdrop').classList.remove('hidden');
}
function closeModal() {
  $('modal-backdrop').classList.add('hidden');
  $('modal-body').innerHTML = '';
}
$('modal-close').addEventListener('click', closeModal);
$('modal-backdrop').addEventListener('click', (e) => {
  if (e.target === $('modal-backdrop')) closeModal();
});

/* ---------------- Bootstrap ---------------- */
async function loadMe() {
  try { me = await api('/api/auth/me'); }
  catch { window.location.href = '/login.html'; return; }
  $('rep-name').textContent = `Olá, ${me.name.split(' ')[0]} 👋`;

  const trial = new Date(me.trialEndsAt);
  let line = '';
  if (me.planStatus === 'active') line = '✓ Assinatura ativa';
  else if (me.subscriptionActive) {
    const days = Math.ceil((trial - Date.now()) / 86400000);
    line = `Teste grátis — ${days} dia(s) restante(s)`;
  } else line = '⚠ Período de teste encerrado';
  $('plan-line').textContent = line;

  if (!me.subscriptionActive) {
    $('banner').innerHTML =
      '<div class="alert warn">Seu período de teste acabou. Assine para continuar — veja a aba <strong>Assinatura</strong>.</div>';
  }
}

async function loadStats() {
  const s = await api('/api/deals/stats/summary');
  $('stat-follow').textContent = s.needFollowUp;
  $('stat-open').textContent = s.openCount;
  $('stat-value').textContent = money(s.openValueCents);
  $('stat-won').textContent = money(s.wonThisMonthCents);
}

/* ---------------- Hoje (follow-up queue) ---------------- */
async function loadToday() {
  const queue = await api('/api/deals/followup');
  const list = $('today-list');
  const empty = $('today-empty');
  list.innerHTML = '';
  if (!queue.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  for (const d of queue) {
    const badge = d.reason === 'due'
      ? `<span class="badge due">⏰ ação atrasada ${d.overdueDays}d</span>`
      : `<span class="badge cold">❄️ esfriando há ${d.overdueDays}d</span>`;
    const who = [d.contact_name, d.contact_company].filter(Boolean).join(' · ') || 'Sem contato';
    const next = d.next_action
      ? `<div class="next">👉 <strong>${escapeHtml(d.next_action)}</strong>${d.next_action_at ? ` (${fmtDate(d.next_action_at)})` : ''}</div>`
      : '<div class="next muted">Sem próximo passo definido</div>';
    const card = document.createElement('div');
    card.className = 'follow-card';
    card.innerHTML = `
      <div>
        <div class="title">${escapeHtml(d.title)} ${badge}</div>
        <div class="sub">${escapeHtml(who)} · ${money(d.value_cents)} · ${escapeHtml(d.stage_name)}</div>
        ${next}
      </div>
      <div class="follow-actions">
        <button class="btn sm" data-log="${d.id}">Registrar contato</button>
        <button class="btn secondary sm" data-win="${d.id}">Ganhou</button>
        <button class="btn ghost sm" data-lost="${d.id}">Perdeu</button>
      </div>`;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-log]').forEach((b) =>
    b.addEventListener('click', () => openActivityModal(b.dataset.log)));
  list.querySelectorAll('[data-win]').forEach((b) =>
    b.addEventListener('click', () => moveToKind(b.dataset.win, 'won')));
  list.querySelectorAll('[data-lost]').forEach((b) =>
    b.addEventListener('click', () => moveToKind(b.dataset.lost, 'lost')));
}

async function moveToKind(dealId, kind) {
  const stage = stages.find((s) => s.kind === kind);
  if (!stage) return;
  await api(`/api/deals/${dealId}/stage`, { method: 'PATCH', body: { stage_id: stage.id } });
  await refreshAll();
}

/* ---------------- Activity logging modal ---------------- */
function openActivityModal(dealId) {
  const types = [
    ['call', '📞 Ligação'], ['whatsapp', '💬 WhatsApp'], ['email', '✉️ E-mail'],
    ['meeting', '🤝 Reunião'], ['note', '📝 Nota'],
  ];
  openModal('Registrar contato', `
    <label>Tipo de interação</label>
    <div class="act-types" id="act-types">
      ${types.map(([v, l], i) => `<button type="button" class="act-type ${i === 0 ? 'selected' : ''}" data-type="${v}">${l}</button>`).join('')}
    </div>
    <label for="act-note">O que aconteceu?</label>
    <textarea id="act-note" rows="2" placeholder="Ex.: Falei com o decisor, pediu proposta até sexta"></textarea>
    <hr style="border:none;border-top:1px solid var(--line);margin:16px 0;" />
    <label for="act-next">Próximo passo <span class="muted">(não deixe o lead esfriar!)</span></label>
    <input id="act-next" placeholder="Ex.: Enviar proposta" />
    <label for="act-next-at">Quando?</label>
    <input id="act-next-at" type="date" value="${tomorrowStr()}" />
    <button class="btn mt" id="act-save" style="width:100%;">Salvar e agendar próximo passo</button>
  `);
  let type = 'call';
  $('act-types').querySelectorAll('.act-type').forEach((b) =>
    b.addEventListener('click', () => {
      type = b.dataset.type;
      $('act-types').querySelectorAll('.act-type').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
    }));
  $('act-save').addEventListener('click', async () => {
    $('act-save').disabled = true;
    const nextAt = $('act-next-at').value;
    await api(`/api/deals/${dealId}/activity`, {
      method: 'POST',
      body: {
        type,
        note: $('act-note').value,
        next_action: $('act-next').value,
        next_action_at: nextAt ? `${nextAt}T09:00` : null,
      },
    });
    closeModal();
    await refreshAll();
  });
}

/* ---------------- New deal modal ---------------- */
function openDealModal() {
  const contactOpts = ['<option value="">— sem contato —</option>']
    .concat(contacts.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` (${escapeHtml(c.company)})` : ''}</option>`))
    .join('');
  const stageOpts = stages
    .filter((s) => s.kind === 'open')
    .map((s, i) => `<option value="${s.id}" ${i === 0 ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');
  openModal('Novo negócio', `
    <label for="d-title">Título do negócio</label>
    <input id="d-title" placeholder="Ex.: Venda recorrente — ACME" required />
    <div class="field-row">
      <div><label for="d-value">Valor (R$)</label><input id="d-value" type="number" min="0" step="0.01" value="0" /></div>
      <div><label for="d-stage">Etapa</label><select id="d-stage">${stageOpts}</select></div>
    </div>
    <label for="d-contact">Contato</label>
    <select id="d-contact">${contactOpts}</select>
    <label for="d-next">Próximo passo <span class="muted">(opcional)</span></label>
    <input id="d-next" placeholder="Ex.: Ligar para apresentar" />
    <input id="d-next-at" type="date" class="mt" />
    <div id="d-alert" class="hidden"></div>
    <button class="btn mt" id="d-save" style="width:100%;">Criar negócio</button>
  `);
  $('d-save').addEventListener('click', async () => {
    const title = $('d-title').value.trim();
    if (!title) { $('d-alert').className = 'alert error'; $('d-alert').textContent = 'Informe um título.'; return; }
    $('d-save').disabled = true;
    const nextAt = $('d-next-at').value;
    await api('/api/deals', {
      method: 'POST',
      body: {
        title,
        value_cents: Math.round(Number($('d-value').value) * 100),
        stage_id: Number($('d-stage').value),
        contact_id: $('d-contact').value ? Number($('d-contact').value) : null,
        next_action: $('d-next').value || null,
        next_action_at: nextAt ? `${nextAt}T09:00` : null,
      },
    });
    closeModal();
    await refreshAll();
    switchTab('pipeline');
  });
}
$('new-deal').addEventListener('click', openDealModal);

/* ---------------- Pipeline (kanban) ---------------- */
async function loadBoard() {
  const board = await api('/api/deals/board');
  const el = $('board');
  el.innerHTML = '';
  for (const col of board) {
    const column = document.createElement('div');
    column.className = 'column';
    column.dataset.stageId = col.id;
    column.innerHTML = `
      <div class="column-head">
        <span class="name">${escapeHtml(col.name)}</span>
        <span class="total">${col.deals.length} · ${money(col.totalCents)}</span>
      </div>
      <div class="column-body"></div>`;
    const body = column.querySelector('.column-body');
    if (!col.deals.length) {
      body.innerHTML = '<div class="column-empty">vazio</div>';
    } else {
      for (const d of col.deals) {
        const who = [d.contact_name, d.contact_company].filter(Boolean).join(' · ');
        const flag = d.followUp.needs ? (d.followUp.reason === 'due' ? 'flag-due' : 'flag-cold') : '';
        const card = document.createElement('div');
        card.className = `deal-card ${flag}`;
        card.draggable = true;
        card.dataset.id = d.id;
        card.innerHTML = `
          <div class="title">${escapeHtml(d.title)}</div>
          ${who ? `<div class="meta">${escapeHtml(who)}</div>` : ''}
          ${d.next_action ? `<div class="meta">👉 ${escapeHtml(d.next_action)}${d.next_action_at ? ` (${fmtDate(d.next_action_at)})` : ''}</div>` : ''}
          <div class="value">${money(d.value_cents)}</div>`;
        card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', d.id));
        card.addEventListener('click', () => openActivityModal(d.id));
        body.appendChild(card);
      }
    }
    column.addEventListener('dragover', (e) => { e.preventDefault(); column.classList.add('dragover'); });
    column.addEventListener('dragleave', () => column.classList.remove('dragover'));
    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      await api(`/api/deals/${id}/stage`, { method: 'PATCH', body: { stage_id: col.id } });
      await refreshAll();
    });
    el.appendChild(column);
  }
}

/* ---------------- Contacts ---------------- */
async function loadContacts() {
  contacts = await api('/api/contacts');
  const body = $('contacts-body');
  body.innerHTML = '';
  if (!contacts.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted">Nenhum contato ainda.</td></tr>';
    return;
  }
  for (const c of contacts) {
    const contactInfo = c.email || c.phone || '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.company || '—')}</td>
      <td>${escapeHtml(contactInfo)}</td>
      <td>${c.open_deals}</td>
      <td><button class="btn danger sm" data-del="${c.id}">Excluir</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Excluir este contato? Os negócios ligados a ele ficam sem contato.')) return;
      await api(`/api/contacts/${b.dataset.del}`, { method: 'DELETE' });
      await loadContacts();
    }));
}
$('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/contacts', {
    method: 'POST',
    body: {
      name: $('c-name').value,
      company: $('c-company').value,
      email: $('c-email').value,
      phone: $('c-phone').value,
    },
  });
  e.target.reset();
  await loadContacts();
});

/* ---------------- Plan ---------------- */
async function loadPlan() {
  const status = await api('/api/billing/status');
  const detail = $('plan-detail');
  const actions = $('plan-actions');
  if (me.planStatus === 'active') {
    detail.textContent = 'Sua assinatura está ativa. Obrigado! 🎉';
    actions.innerHTML = '';
  } else {
    detail.innerHTML = me.subscriptionActive
      ? `Você está no teste grátis. Plano: <strong>${me.planPriceLabel}</strong>.`
      : `Seu teste acabou. Assine por <strong>${me.planPriceLabel}</strong> para continuar.`;
    actions.innerHTML = `<button class="btn" id="subscribe">Assinar agora — ${me.planPriceLabel}</button>`;
    $('subscribe').addEventListener('click', async (e) => {
      e.target.disabled = true;
      const { url } = await api('/api/billing/checkout', { method: 'POST' });
      window.location.href = url;
    });
  }
  $('stripe-note').textContent = status.stripeEnabled
    ? 'Pagamento processado com segurança via Stripe.'
    : 'Modo demonstração: o Stripe não está configurado, então a assinatura é ativada localmente para teste.';
}

/* ---------------- Tabs ---------------- */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
}
document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

$('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

async function refreshAll() {
  await Promise.all([loadStats(), loadToday(), loadBoard(), loadContacts()]);
}

/* ---------------- Init ---------------- */
const params = new URLSearchParams(location.search);
if (params.get('billing') === 'success' || params.get('billing') === 'stub-activated') {
  $('banner').innerHTML = '<div class="alert ok">Assinatura ativada com sucesso! 🎉</div>';
}

await loadMe();
stages = await api('/api/pipeline/stages');
await Promise.all([loadStats(), loadToday(), loadBoard(), loadContacts(), loadPlan()]);
