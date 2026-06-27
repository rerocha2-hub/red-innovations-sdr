# AgendaPro 📅

**Micro-SaaS de agendamento para pequenos negócios** — clínicas, salões, barbearias, consultórios e prestadores de serviço.

O dono cadastra seus serviços e horários, ganha uma **página de agendamento própria** (`/book/seu-negocio`) e passa a receber marcações organizadas em um painel, com **confirmações automáticas por e-mail**. Monetização por **assinatura mensal** com **14 dias de teste grátis**.

Este projeto é uma implementação real e funcional da estratégia de Micro-SaaS descrita na tarefa: identificar uma dor (agendamento manual no WhatsApp), resolver com um app simples, automatizar (e-mails + Stripe) e cobrar uma mensalidade.

---

## ✨ Funcionalidades

- **Multi-tenant**: cada negócio tem sua conta, slug e página pública de agendamento.
- **Autenticação** com senha (bcrypt) e sessão via cookie httpOnly (JWT).
- **Serviços**: nome, duração e preço; ativar/desativar.
- **Horário de funcionamento** por dia da semana.
- **Geração de horários livres** respeitando duração do serviço, horários ocupados e horários já passados.
- **Página pública de agendamento** — cliente escolhe serviço, data e horário.
- **Proteção contra agendamento em dobro** (revalidação no momento da reserva).
- **Automação por e-mail**: confirmação para o cliente + aviso para o dono (via SMTP, ou impresso no console no modo demo).
- **Assinatura via Stripe Checkout** + webhook; sem chaves, um *stub* local ativa o plano para você testar o fluxo.
- **Bloqueio pós-teste**: encerrado o trial sem assinatura, o negócio para de aceitar agendamentos.

## 🧱 Stack

Node.js + Express · SQLite (better-sqlite3) · Stripe · Nodemailer · frontend em HTML/CSS/JS puro (sem build).

## 🚀 Rodando localmente

```bash
npm install
npm run seed     # opcional: cria um negócio de demonstração
npm start        # http://localhost:3000
```

Funciona **sem nenhuma configuração**:
- Sem Stripe → o checkout usa um *stub* e ativa a assinatura localmente.
- Sem SMTP → os e-mails são impressos no console.

Para configurar Stripe/SMTP de verdade, copie `.env.example` para `.env` e preencha as variáveis.

### Conta de demonstração (após `npm run seed`)

- **Login:** `demo@agendapro.app` / `demo1234`
- **Painel:** http://localhost:3000/dashboard
- **Página de agendamento:** o link é impresso no terminal.

## 🧪 Testes

```bash
npm test
```

Cobre a lógica pura de geração de horários (`src/lib/slots.js`) e um fluxo de integração ponta a ponta (cadastro → serviço → horários → agendamento público → proteção contra duplicidade) usando um banco SQLite isolado.

## 📁 Estrutura

```
server.js              # entrypoint Express
src/
  config.js            # configuração via env
  db.js                # schema SQLite
  lib/                 # auth, slots, email, billing, slug
  routes/              # auth, services, availability, appointments, public, billing
public/                # frontend (landing, login, signup, dashboard, booking)
scripts/seed.js        # dados de demonstração
test/                  # testes unitários e de integração
```

## 🔌 API (resumo)

| Método | Rota | Descrição |
|-------|------|-----------|
| POST | `/api/auth/signup` | Cria negócio + inicia trial |
| POST | `/api/auth/login` · `/logout` | Sessão |
| GET | `/api/auth/me` | Dados do negócio logado |
| GET/POST/PATCH/DELETE | `/api/services` | CRUD de serviços |
| GET/PUT | `/api/availability` | Horário de funcionamento |
| GET | `/api/appointments` | Agendamentos do negócio |
| PATCH | `/api/appointments/:id/cancel` | Cancelar |
| GET | `/api/public/:slug` | Perfil público + serviços |
| GET | `/api/public/:slug/slots` | Horários livres |
| POST | `/api/public/:slug/book` | Criar agendamento |
| POST | `/api/billing/checkout` | Iniciar assinatura |
| POST | `/api/billing/webhook` | Webhook do Stripe |

## ⚠️ Notas

Projeto de demonstração/MVP. Para produção, considere: rate limiting, validação reforçada, fuso horário por negócio, lembretes por SMS/WhatsApp e backups do banco.
