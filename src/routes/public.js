import { Router } from 'express';
import { db } from '../db.js';
import { subscriptionActive } from '../lib/auth.js';
import { availableSlots, minutesToTime, timeToMinutes } from '../lib/slots.js';
import {
  sendMail,
  bookingConfirmationEmail,
  ownerNotificationEmail,
} from '../lib/email.js';

const router = Router();

function getBusinessBySlug(slug) {
  return db.prepare('SELECT * FROM businesses WHERE slug = ?').get(slug);
}

// Public profile: business name + active services.
router.get('/:slug', (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado.' });
  const services = db
    .prepare('SELECT id, name, duration_min, price_cents FROM services WHERE business_id = ? AND active = 1 ORDER BY name')
    .all(business.id);
  res.json({
    name: business.name,
    slug: business.slug,
    acceptingBookings: subscriptionActive(business),
    services,
  });
});

// Available slots for a given service + date (YYYY-MM-DD).
router.get('/:slug/slots', (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado.' });
  const { serviceId, date } = req.query;
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ error: 'serviceId e date (YYYY-MM-DD) são obrigatórios.' });
  }
  const service = db
    .prepare('SELECT * FROM services WHERE id = ? AND business_id = ? AND active = 1')
    .get(serviceId, business.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  const weekday = new Date(`${date}T12:00:00`).getDay();
  const hours = db
    .prepare('SELECT * FROM availability WHERE business_id = ? AND weekday = ?')
    .get(business.id, weekday);
  if (!hours) return res.json({ slots: [] }); // closed that day

  const booked = db
    .prepare(
      `SELECT starts_at, ends_at FROM appointments
        WHERE business_id = ? AND status = 'confirmed'
          AND substr(starts_at, 1, 10) = ?`,
    )
    .all(business.id, date)
    .map((a) => ({ start: a.starts_at.slice(11, 16), end: a.ends_at.slice(11, 16) }));

  // Hide past slots if the requested date is today.
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMinutes =
    date === todayStr ? new Date().getHours() * 60 + new Date().getMinutes() : null;

  const slots = availableSlots({
    startTime: hours.start_time,
    endTime: hours.end_time,
    durationMin: service.duration_min,
    booked,
    nowMinutes,
  });
  res.json({ slots });
});

// Create a booking.
router.post('/:slug/book', (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado.' });
  if (!subscriptionActive(business)) {
    return res.status(403).json({ error: 'Este negócio não está aceitando agendamentos no momento.' });
  }

  const { serviceId, date, time, customer_name, customer_email, customer_phone, notes } =
    req.body || {};
  if (!serviceId || !date || !time || !customer_name) {
    return res.status(400).json({ error: 'Serviço, data, horário e nome são obrigatórios.' });
  }
  const service = db
    .prepare('SELECT * FROM services WHERE id = ? AND business_id = ? AND active = 1')
    .get(serviceId, business.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  const startsAt = `${date}T${time}`;
  const endMinutes = timeToMinutes(time) + service.duration_min;
  const endsAt = `${date}T${minutesToTime(endMinutes)}`;

  // Re-validate the slot is still open (guards against double-booking).
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const hours = db
    .prepare('SELECT * FROM availability WHERE business_id = ? AND weekday = ?')
    .get(business.id, weekday);
  if (!hours) return res.status(409).json({ error: 'Horário indisponível.' });
  const booked = db
    .prepare(
      `SELECT starts_at, ends_at FROM appointments
        WHERE business_id = ? AND status = 'confirmed' AND substr(starts_at,1,10) = ?`,
    )
    .all(business.id, date)
    .map((a) => ({ start: a.starts_at.slice(11, 16), end: a.ends_at.slice(11, 16) }));
  const open = availableSlots({
    startTime: hours.start_time,
    endTime: hours.end_time,
    durationMin: service.duration_min,
    booked,
  });
  if (!open.includes(time)) {
    return res.status(409).json({ error: 'Esse horário acabou de ser reservado. Escolha outro.' });
  }

  const info = db
    .prepare(
      `INSERT INTO appointments
         (business_id, service_id, customer_name, customer_email, customer_phone, starts_at, ends_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      business.id,
      service.id,
      customer_name.trim(),
      (customer_email || '').trim() || null,
      (customer_phone || '').trim() || null,
      startsAt,
      endsAt,
      (notes || '').trim() || null,
    );
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(info.lastInsertRowid);

  // Fire-and-forget automation: confirm to the customer, notify the owner.
  sendMail(bookingConfirmationEmail(appt, business, service)).catch(() => {});
  sendMail(ownerNotificationEmail(appt, business, service)).catch(() => {});

  res.status(201).json({ ok: true, startsAt, service: service.name });
});

export default router;
