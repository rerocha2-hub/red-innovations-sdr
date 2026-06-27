import { api, showAlert, money } from '/js/api.js';

const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const alertEl = document.getElementById('alert');
let selectedSlot = null;
let biz = null;

const dateInput = document.getElementById('date');
const serviceSel = document.getElementById('service');
const slotsEl = document.getElementById('slots');
const noSlots = document.getElementById('no-slots');
const customer = document.getElementById('customer');

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function init() {
  try {
    biz = await api(`/api/public/${encodeURIComponent(slug)}`);
  } catch {
    showAlert(alertEl, 'Negócio não encontrado.', 'error');
    return;
  }
  document.getElementById('biz-name').textContent = biz.name;
  document.title = `Agendar — ${biz.name}`;

  if (!biz.acceptingBookings) {
    showAlert(alertEl, 'Este negócio não está aceitando agendamentos no momento.', 'warn');
    return;
  }
  if (!biz.services.length) {
    showAlert(alertEl, 'Nenhum serviço disponível para agendamento ainda.', 'warn');
    return;
  }

  for (const s of biz.services) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.price_cents > 0
      ? `${s.name} — ${s.duration_min}min · ${money(s.price_cents)}`
      : `${s.name} — ${s.duration_min}min`;
    serviceSel.appendChild(opt);
  }
  dateInput.min = todayStr();
  dateInput.value = todayStr();
  document.getElementById('flow').classList.remove('hidden');

  serviceSel.addEventListener('change', loadSlots);
  dateInput.addEventListener('change', loadSlots);
  await loadSlots();
}

async function loadSlots() {
  selectedSlot = null;
  customer.classList.add('hidden');
  slotsEl.innerHTML = '';
  noSlots.classList.add('hidden');
  const serviceId = serviceSel.value;
  const date = dateInput.value;
  if (!serviceId || !date) return;

  let data;
  try {
    data = await api(`/api/public/${encodeURIComponent(slug)}/slots?serviceId=${serviceId}&date=${date}`);
  } catch (err) {
    showAlert(alertEl, err.message);
    return;
  }
  if (!data.slots.length) {
    noSlots.classList.remove('hidden');
    return;
  }
  for (const slot of data.slots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot';
    btn.textContent = slot;
    btn.addEventListener('click', () => {
      selectedSlot = slot;
      slotsEl.querySelectorAll('.slot').forEach((s) => s.classList.remove('selected'));
      btn.classList.add('selected');
      customer.classList.remove('hidden');
      customer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    slotsEl.appendChild(btn);
  }
}

document.getElementById('confirm').addEventListener('click', async () => {
  const name = document.getElementById('cname').value.trim();
  if (!name) return showAlert(alertEl, 'Por favor, informe seu nome.');
  if (!selectedSlot) return showAlert(alertEl, 'Escolha um horário.');
  alertEl.classList.add('hidden');
  const btn = document.getElementById('confirm');
  btn.disabled = true;
  try {
    const r = await api(`/api/public/${encodeURIComponent(slug)}/book`, {
      method: 'POST',
      body: {
        serviceId: serviceSel.value,
        date: dateInput.value,
        time: selectedSlot,
        customer_name: name,
        customer_email: document.getElementById('cemail').value,
        customer_phone: document.getElementById('cphone').value,
        notes: document.getElementById('cnotes').value,
      },
    });
    document.getElementById('flow').classList.add('hidden');
    document.getElementById('done').classList.remove('hidden');
    document.getElementById('done-detail').textContent =
      `${r.service} — ${new Date(r.startsAt).toLocaleString('pt-BR')}`;
  } catch (err) {
    showAlert(alertEl, err.message);
    btn.disabled = false;
    await loadSlots(); // refresh in case the slot was taken
  }
});

document.getElementById('again').addEventListener('click', () => location.reload());

init();
