import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config, ROOT } from './src/config.js';
import './src/db.js'; // initialize schema on boot

import authRoutes from './src/routes/auth.js';
import contactRoutes from './src/routes/contacts.js';
import dealRoutes from './src/routes/deals.js';
import pipelineRoutes from './src/routes/pipeline.js';
import billingRoutes from './src/routes/billing.js';
import digestRoutes from './src/routes/digest.js';

const app = express();
app.disable('x-powered-by');

// Stripe webhook must receive the raw body — mount BEFORE express.json().
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/digest', digestRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Avoid a noisy 404 for the browser's automatic favicon request.
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- Static frontend ---
const PUBLIC_DIR = path.join(ROOT, 'public');
app.use(express.static(PUBLIC_DIR));

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
    console.log(`\n🚀 PipeSolo rodando em ${config.appUrl}`);
    console.log(`   Stripe: ${config.stripe.enabled ? 'ativo' : 'modo simulação (stub)'}`);
    console.log(`   SMTP:   ${config.smtp.enabled ? 'ativo' : 'modo simulação (console)'}\n`);
  });
}
