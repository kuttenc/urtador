# Urtador — melhorias futuras

Atualizado em 19/10/2026.

## Próxima prioridade

1. Revisar o fluxo completo de recuperação de senha em produção: solicitar código, validar, criar nova senha e encerrar sessões antigas.
2. Conferir no Supabase a fonte de verdade dos repasses por mil visitas e garantir que o painel reflita o valor salvo no banco.
3. Revisar desempenho e preenchimento dos banners Adsterra nas rotas curtas sem alterar a abertura voluntária do destino.

## Melhorias de produto

1. Mostrar no painel administrativo os motivos de uma visita não ser qualificada, sem expor IPs ou identificadores sensíveis.
2. Exibir ao administrador o status operacional de mensageria de forma privada e genérica.
3. Manter contas adicionais por telefone e a mesclagem de lucros como regras de backend auditáveis, caso esse fluxo permaneça ativo.
4. Documentar cada mudança de regra de repasse com data de vigência.

## Critérios para concluir um item

- Migração e Edge Function publicadas, quando necessárias.
- Interface do GitHub Pages atualizada.
- Fluxo testado em navegador móvel.
- Estado e versão atualizados em `PROJECT_STATUS.md`.

