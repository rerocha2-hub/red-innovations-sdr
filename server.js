import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config, ROOT } from './src/config.js';
import './src/db.js'; // initialize schema on boot

import authRoutes from './src/routes/auth.js';
import serviceRoutes from './src/routes/services.js';
import availabilityRoutes from './src/routes/availability.js';
import appointmentRoutes from './src/routes/appointments.js';
import publicRoutes from './src/routes/public.js';
import billingRoutes from './src/routes/billing.js';

const app = express();
app.disable('x-powered-by');

// Stripe webhook must receive the raw body — mount BEFORE express.json().
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/billing', billingRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- Static frontend ---
const PUBLIC_DIR = path.join(ROOT, 'public');
app.use(express.static(PUBLIC_DIR));

// Pretty URL for the public booking page: /book/:slug
app.get('/book/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'book.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

// JSON 404 for unmatched API routes.
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Centralized error handler.
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

export { app };

// Only start listening when run directly (so tests can import the app).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  app.listen(config.port, () => {
    console.log(`\n🚀 AgendaPro rodando em ${config.appUrl}`);
    console.log(`   Stripe: ${config.stripe.enabled ? 'ativo' : 'modo simulação (stub)'}`);
    console.log(`   SMTP:   ${config.smtp.enabled ? 'ativo' : 'modo simulação (console)'}\n`);
  });
}
