import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;
if (config.smtp.enabled) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

/**
 * Send an email. When SMTP is not configured (the default), the message is
 * logged to the console so the flow is observable in development.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to) return { skipped: true };
  if (!transporter) {
    console.log(
      `\n📧 [e-mail simulado]\n  Para: ${to}\n  Assunto: ${subject}\n  ${text}\n`,
    );
    return { simulated: true };
  }
  return transporter.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html: html || `<pre>${text}</pre>`,
  });
}

export function welcomeEmail(rep) {
  return {
    to: rep.email,
    subject: 'Bem-vindo(a) ao PipeSolo 🚀',
    text:
      `Olá ${rep.name}! Sua conta está pronta.\n\n` +
      `Seu teste grátis vai até ${new Date(rep.trial_ends_at).toLocaleDateString('pt-BR')}.\n` +
      `Dica de ouro: cadastre seus negócios em aberto e deixe o PipeSolo te avisar quem perseguir todo dia.\n` +
      `Acesse: ${config.appUrl}/dashboard\n`,
  };
}

/**
 * Daily digest of deals that need a follow-up. Triggered manually or by a cron
 * job hitting POST /api/digest (see routes/digest.js). Kept here so the message
 * format lives next to the others.
 */
export function followUpDigestEmail(rep, queue) {
  const lines = queue
    .slice(0, 10)
    .map((q) => {
      const tag = q.reason === 'due' ? '⏰ ação marcada' : '❄️ esfriando';
      return `• ${q.deal.title} — ${tag}${q.deal.next_action ? ` (${q.deal.next_action})` : ''}`;
    })
    .join('\n');
  return {
    to: rep.email,
    subject: `Você tem ${queue.length} follow-up(s) para hoje`,
    text:
      `Bom dia, ${rep.name}! Estes negócios precisam de você hoje:\n\n${lines}\n\n` +
      `Abra o PipeSolo e feche mais: ${config.appUrl}/dashboard\n`,
  };
}
