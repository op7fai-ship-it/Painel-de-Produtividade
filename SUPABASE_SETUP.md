# Supabase Setup

Este projeto usa SQLite hoje. A migration abaixo prepara o mesmo schema em PostgreSQL para uso no Supabase, sem alterar os endpoints atuais do backend.

## Projeto

- Project ref: `kclijczesrenrkqehxwm`
- URL: `https://kclijczesrenrkqehxwm.supabase.co`

## O que ja foi criado

- Migration inicial: `supabase/migrations/202603020001_initial_schema.sql`
- Arquivo pronto para SQL Editor: `supabase/sql_editor_setup.sql`
- Config da CLI: `supabase/config.toml`
- Exemplo de variaveis: `backend/.env.example`
- Backend convertido para usar Supabase REST: `backend/src/server.js`
- Vercel Function pronta: `api/index.js`
- Config de deploy: `vercel.json`

## Como conectar o projeto via Supabase CLI

1. Instale a CLI:
   `npm install -g supabase`
2. Faça login:
   `supabase login`
3. Linke este repositório ao projeto:
   `supabase link --project-ref kclijczesrenrkqehxwm`
4. Aplique a migration:
   `supabase db push`

## Como conectar pelo painel do Supabase

1. Abra o SQL Editor no projeto Supabase
2. Cole o conteudo de `supabase/sql_editor_setup.sql`
3. Execute o script

Esse e o arquivo certo para colar. `backend/src/server.js` nao deve ser colado no Supabase.

## Credenciais

A chave `sb_publishable_...` e uma chave publica de cliente. Ela serve para chamadas client-side ao projeto, mas nao serve para executar migrations nem para acesso administrativo ao banco.

A chave `sb_secret_...` pode ser usada no backend para chamadas server-side na API REST do Supabase, mas ela ainda nao substitui a senha do banco nem a sessao autenticada da Supabase CLI para executar migrations de schema.

Para aplicar migrations remotamente com automacao, voce vai precisar de um destes:

- Sessao autenticada no `supabase login`
- Connection string Postgres do projeto

## Como usar a chave secreta no backend

1. Copie `backend/.env.example` para `backend/.env`
2. Preencha `SUPABASE_SERVICE_ROLE_KEY` com a sua chave `sb_secret_...`
3. Suba o backend com as variaveis configuradas
4. O arquivo `backend/src/server.js` ja passa a usar o Supabase como banco

## Como testar na Vercel

Defina estas variaveis de ambiente no projeto da Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `CORS_ORIGIN`

Se o frontend e a API estiverem no mesmo projeto Vercel, deixe `VITE_API_URL` vazio para usar a mesma origem.

O segredo nao deve ser colocado no frontend nem commitado no repositório.

## Observacao importante

A migration usa nomes de colunas em `snake_case`, que e o padrao recomendado no PostgreSQL/Supabase. O backend atual ainda usa SQLite e `camelCase`, entao sera necessario adaptar o backend antes de trocar a base de dados em producao.
