import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT) || 3000,
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  trialDays: Number(process.env.TRIAL_DAYS) || 14,
  planPriceLabel: process.env.PLAN_PRICE_LABEL || 'R$ 49/mês',
  dataDir: process.env.DB_FILE ? path.dirname(process.env.DB_FILE) : path.join(ROOT, 'data'),
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'agendapro.sqlite'),
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    priceId: process.env.STRIPE_PRICE_ID || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    enabled: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'AgendaPro <no-reply@agendapro.app>',
    enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
  },
};
