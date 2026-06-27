# PipeSolo 🎯

**CRM e pipeline para representantes comerciais solo** — reps independentes, consultores, closers freelance e autônomos de B2B.

O PipeSolo não é "mais um CRM com 200 campos". Ele resolve a dor nº1 de quem vende sozinho: **deixar o lead esfriar e esquecer o follow-up.** Todo dia ele entrega uma **fila "Hoje"** dizendo exatamente quem perseguir, e cada interação é registrada **em um toque**, já agendando o próximo passo.

> Construído como pivot orientado por pesquisa de mercado: a pesquisa mostrou que **48% dos vendedores nunca fazem um único follow-up**, que um processo consistente de follow-up eleva a conversão em **~78%**, e que reps solo abandonam CRMs como Salesforce/HubSpot por serem caros, inchados e cheios de digitação manual. O PipeSolo ataca exatamente isso.

---

## ✨ Funcionalidades

- **Fila "Hoje" (o diferencial)**: lista priorizada de negócios que precisam de ação — ações agendadas atrasadas (`due`) e negócios parados além do limite (`cold`).
- **Registro em 1 toque**: ligação / WhatsApp / e-mail / reunião / nota, sempre agendando o próximo passo para o lead nunca esfriar.
- **Pipeline visual (kanban)**: arraste negócios entre etapas; veja contagem e valor por etapa.
- **Contatos** vinculados a negócios.
- **Métricas**: follow-ups do dia, negócios em aberto, valor no pipeline, ganho no mês.
- **Resumo diário por e-mail**: endpoint de digest para um cron (Make/Zapier) disparar o "quem perseguir hoje" toda manhã.
- **Assinatura via Stripe** + webhook (com *stub* local quando não há chaves).
- **Multi-tenant** com trial de 14 dias e bloqueio pós-teste.

## 🧱 Stack

Node.js + Express · SQLite (better-sqlite3) · Stripe · Nodemailer · frontend em HTML/CSS/JS puro (sem build, drag-and-drop nativo).

## 🚀 Rodando localmente

```bash
npm install
npm run seed     # opcional: cria um rep de demonstração com negócios
npm start        # http://localhost:3000
```

Funciona **sem nenhuma configuração**:
- Sem Stripe → checkout em modo *stub* ativa a assinatura localmente.
- Sem SMTP → e-mails (boas-vindas e digest) são impressos no console.

Configurar Stripe/SMTP de verdade: copie `.env.example` para `.env` e preencha.

### Conta de demonstração (após `npm run seed`)
- **Login:** `demo@pipesolo.app` / `demo1234`
- **Painel:** http://localhost:3000/dashboard
- Vem com negócios em estados diferentes (atrasado, esfriando, agendado, novo) para você ver a fila "Hoje" em ação.

## 🧪 Testes

```bash
npm test
```

Cobre a lógica pura de follow-up (`src/lib/followup.js` — quem entra na fila e em que ordem) e um fluxo de integração ponta a ponta (cadastro → contato → negócio → registro de atividade → fila de follow-up → ganho → métricas), com banco SQLite isolado.

## 📁 Estrutura

```
server.js              # entrypoint Express
src/
  config.js            # configuração via env
  db.js                # schema SQLite + estágios padrão
  lib/                 # auth, followup (núcleo), email, billing
  routes/              # auth, contacts, deals, pipeline, billing, digest
public/                # frontend (landing, login, signup, dashboard)
scripts/seed.js        # dados de demonstração
test/                  # testes unitários e de integração
```

## 🔌 API (resumo)

| Método | Rota | Descrição |
|-------|------|-----------|
| POST | `/api/auth/signup` · `/login` · `/logout` | Conta + sessão |
| GET | `/api/auth/me` | Dados do rep logado |
| GET/POST/PATCH/DELETE | `/api/contacts` | CRUD de contatos |
| GET | `/api/deals` | Negócios (`?status=open`) |
| GET | `/api/deals/board` | Kanban por etapa com totais |
| GET | `/api/deals/followup` | **Fila "Hoje"** priorizada |
| GET | `/api/deals/stats/summary` | Métricas do painel |
| POST | `/api/deals` | Criar negócio |
| PATCH | `/api/deals/:id` · `/:id/stage` | Editar / mover etapa |
| POST | `/api/deals/:id/activity` | Registrar interação + próximo passo |
| GET | `/api/pipeline/stages` | Etapas do pipeline |
| POST | `/api/billing/checkout` · `/webhook` | Assinatura |
| POST | `/api/digest/run` | Dispara o resumo diário (protegido por segredo) |

## ⚠️ Notas

MVP de demonstração. O mercado de pipeline é concorrido (Pipedrive, Bigin, Streak), então o diferencial aqui é o **foco em follow-up com mínima digitação**, não a quantidade de recursos. Próximos passos naturais para produção: lembretes por WhatsApp/SMS, app mobile dedicado, importação de contatos (CSV), e rastreio de comissão por linha (para o nicho de manufacturer's rep).
