// Seed a demo rep with contacts and deals so you can explore the app instantly.
// Usage: npm run seed   (then log in with the printed credentials)
import { db, DEFAULT_STAGES } from '../src/db.js';
import { config } from '../src/config.js';
import { hashPassword } from '../src/lib/auth.js';

const EMAIL = 'demo@pipesolo.app';
const PASSWORD = 'demo1234';

const existing = db.prepare('SELECT * FROM reps WHERE email = ?').get(EMAIL);
if (existing) {
  console.log('Demo já existe. Login:', EMAIL, '/', PASSWORD);
  console.log('Painel:', `${config.appUrl}/dashboard`);
  process.exit(0);
}

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

const tx = db.transaction(() => {
  const rep = db
    .prepare('INSERT INTO reps (name, email, password_hash, trial_ends_at) VALUES (?, ?, ?, ?)')
    .run('Maria Vendas', EMAIL, hashPassword(PASSWORD), daysFromNow(config.trialDays));
  const rid = rep.lastInsertRowid;

  const insStage = db.prepare('INSERT INTO stages (rep_id, name, position, kind) VALUES (?, ?, ?, ?)');
  DEFAULT_STAGES.forEach((s, i) => insStage.run(rid, s.name, i, s.kind));
  const stages = db.prepare('SELECT * FROM stages WHERE rep_id = ? ORDER BY position').all(rid);
  const stageByName = Object.fromEntries(stages.map((s) => [s.name, s.id]));

  const insContact = db.prepare(
    'INSERT INTO contacts (rep_id, name, company, email, phone) VALUES (?, ?, ?, ?, ?)',
  );
  const c1 = insContact.run(rid, 'João Almeida', 'ACME Distribuidora', 'joao@acme.com', '(11) 99999-0001').lastInsertRowid;
  const c2 = insContact.run(rid, 'Patrícia Lima', 'Lima Comércio', 'patricia@lima.com', '(11) 99999-0002').lastInsertRowid;
  const c3 = insContact.run(rid, 'Ricardo Souza', 'RS Atacado', 'ricardo@rs.com', '(11) 99999-0003').lastInsertRowid;

  const insDeal = db.prepare(
    `INSERT INTO deals (rep_id, contact_id, title, value_cents, stage_id, next_action, next_action_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Overdue scheduled action → shows as "due" in the Hoje queue.
  insDeal.run(rid, c1, 'Pedido recorrente — 200 un.', 480000, stageByName['Proposta'], 'Enviar proposta revisada', daysFromNow(-2), daysFromNow(-2));
  // No next action + old activity → shows as "cold".
  insDeal.run(rid, c2, 'Primeiro pedido — linha nova', 150000, stageByName['Qualificado'], null, null, daysFromNow(-6));
  // Future action → not in the queue yet.
  insDeal.run(rid, c3, 'Renovação anual', 920000, stageByName['Negociação'], 'Ligar para fechar', daysFromNow(2), daysFromNow(-1));
  // Fresh lead.
  insDeal.run(rid, null, 'Lead do site', 0, stageByName['Novo lead'], null, null, daysFromNow(0));
});

tx();
console.log('✅ Demo criada!');
console.log('   Login:', EMAIL, '/', PASSWORD);
console.log('   Painel:', `${config.appUrl}/dashboard`);
