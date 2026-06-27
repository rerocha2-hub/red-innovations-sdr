// Seed a demo business so you can explore the app immediately.
// Usage: npm run seed   (then log in with the printed credentials)
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { hashPassword } from '../src/lib/auth.js';
import { uniqueSlug } from '../src/lib/slug.js';

const EMAIL = 'demo@agendapro.app';
const PASSWORD = 'demo1234';

const existing = db.prepare('SELECT * FROM businesses WHERE owner_email = ?').get(EMAIL);
if (existing) {
  console.log('Demo já existe. Login:', EMAIL, '/', PASSWORD);
  console.log('Página de agendamento:', `${config.appUrl}/book/${existing.slug}`);
  process.exit(0);
}

const trialEnds = new Date(Date.now() + config.trialDays * 86400000).toISOString();
const slug = uniqueSlug('Salão Demonstração');

const tx = db.transaction(() => {
  const info = db
    .prepare(
      `INSERT INTO businesses (name, slug, owner_email, password_hash, trial_ends_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run('Salão Demonstração', slug, EMAIL, hashPassword(PASSWORD), trialEnds);
  const bid = info.lastInsertRowid;

  const svc = db.prepare(
    'INSERT INTO services (business_id, name, duration_min, price_cents) VALUES (?, ?, ?, ?)',
  );
  svc.run(bid, 'Corte de cabelo', 30, 5000);
  svc.run(bid, 'Barba', 20, 3000);
  svc.run(bid, 'Corte + Barba', 50, 7000);

  const hrs = db.prepare(
    'INSERT INTO availability (business_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)',
  );
  for (const wd of [1, 2, 3, 4, 5, 6]) hrs.run(bid, wd, '09:00', '18:00');
  return slug;
});

const createdSlug = tx();
console.log('✅ Demo criada!');
console.log('   Login:', EMAIL, '/', PASSWORD);
console.log('   Painel:', `${config.appUrl}/dashboard`);
console.log('   Agendamento público:', `${config.appUrl}/book/${createdSlug}`);
