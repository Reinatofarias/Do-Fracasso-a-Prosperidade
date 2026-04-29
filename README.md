# Do Fracasso a Prosperidade

Sistema financeiro para organização pessoal e empresarial.

Base visual e conceitual: "Vivendo ao invés de sobreviver" e 2 Coríntios 8:9.

## Stack

- React + Vite + TypeScript
- API local/serverless com Express
- Prisma 7
- PostgreSQL para deploy na Vercel
- Recharts e lucide-react

## Rodar localmente

```bash
npm install
npm run db:generate
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:3333/api/health`

Sem banco configurado, a interface entra em modo demonstração após tentar login.

## Banco de dados

Configure `DATABASE_URL` no `.env` com uma conexão PostgreSQL.

Depois rode:

```bash
npm run db:push
npm run db:seed
```

Usuários iniciais via `.env`:

```env
SEED_USER_1_NAME="Seu Nome"
SEED_USER_1_EMAIL="seu@email.com"
SEED_USER_1_PASSWORD="senha-segura"

SEED_USER_2_NAME="Nome da Esposa"
SEED_USER_2_EMAIL="esposa@email.com"
SEED_USER_2_PASSWORD="senha-segura"
```

## Deploy na Vercel

Configure as variáveis no painel da Vercel:

- `DATABASE_URL`
- `JWT_SECRET`
- `SEED_USER_1_NAME`
- `SEED_USER_1_EMAIL`
- `SEED_USER_1_PASSWORD`
- `SEED_USER_2_NAME`
- `SEED_USER_2_EMAIL`
- `SEED_USER_2_PASSWORD`

Use um PostgreSQL externo, como Neon, Supabase ou Vercel Postgres.

Antes do primeiro uso em produção, execute localmente apontando para o banco de produção:

```bash
npm run db:push
npm run db:seed
```

## MVP atual

- Login para dois usuários via seed
- Perfis pessoal e empresarial
- Contas e categorias iniciais
- Lançamentos de receita/despesa
- Dashboard dark em dourado e verde
- Gráficos de fluxo e despesas por categoria
- Modal de projeção financeira com boas práticas
