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
 * logged to the console so the automation flow is observable in development.
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

export function welcomeEmail(business, bookingUrl) {
  return {
    to: business.owner_email,
    subject: 'Bem-vindo(a) ao AgendaPro 🎉',
    text:
      `Olá! Sua conta "${business.name}" está pronta.\n\n` +
      `Seu teste grátis vai até ${new Date(business.trial_ends_at).toLocaleDateString('pt-BR')}.\n` +
      `Compartilhe seu link de agendamento com os clientes:\n${bookingUrl}\n`,
  };
}

export function bookingConfirmationEmail(appt, business, service) {
  const when = new Date(appt.starts_at).toLocaleString('pt-BR');
  return {
    to: appt.customer_email,
    subject: `Agendamento confirmado em ${business.name}`,
    text:
      `Olá ${appt.customer_name}, seu horário está confirmado!\n\n` +
      `Serviço: ${service.name}\nData: ${when}\nLocal: ${business.name}\n`,
  };
}

export function ownerNotificationEmail(appt, business, service) {
  const when = new Date(appt.starts_at).toLocaleString('pt-BR');
  return {
    to: business.owner_email,
    subject: `Novo agendamento: ${appt.customer_name}`,
    text:
      `Você recebeu um novo agendamento!\n\n` +
      `Cliente: ${appt.customer_name}\nContato: ${appt.customer_email || appt.customer_phone || '—'}\n` +
      `Serviço: ${service.name}\nData: ${when}\n`,
  };
}
