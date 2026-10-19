# Urtador — guia para continuidade

Leia `PROJECT_STATUS.md` antes de alterar este projeto.

## Estrutura

- Interface estática do GitHub Pages: arquivos HTML, CSS e JavaScript nesta pasta.
- Redirecionamento: rotas curtas são atendidas pelo `404.html` e pelo backend `kutt-short-links` no Supabase.
- Banco e Edge Functions: consulte `../supabase/migrations` e `../supabase/functions`.

## Regras importantes

- Não exponha tokens de mensageria, secrets do Supabase ou dados pessoais em telas públicas, textos de erro, commits ou documentação.
- Nunca altere regras de saldo, repasse, saque, sessão ou OTP apenas no frontend; localize primeiro a regra server-side correspondente.
- Ao mudar mensagens ao usuário, use nomes genéricos como “mensagem de acesso” ou “serviço de mensagens”; não revele fornecedores internos.
- Verifique a versão publicada no GitHub Pages antes de concluir que uma alteração chegou à produção.

## Documentos canônicos

- Estado e decisões: `PROJECT_STATUS.md`
- Backlog: `FUTURE_IMPROVEMENTS.md`
- Visão técnica histórica: `README.md`

