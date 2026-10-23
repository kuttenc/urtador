# Urtador — melhorias futuras

Atualizado em 23/10/2026.

## Próxima prioridade

1. Revisar o fluxo completo de recuperação de senha em produção: solicitar código, validar, criar nova senha e encerrar sessões antigas.
2. Conferir no Supabase a fonte de verdade dos repasses por mil visitas e garantir que o painel reflita o valor salvo no banco.
3. Revisar desempenho e preenchimento dos banners Adsterra nas rotas curtas sem alterar a abertura voluntária do destino.

## Melhorias de produto

1. Mostrar no painel administrativo os motivos de uma visita não ser qualificada, sem expor IPs ou identificadores sensíveis.
2. Exibir ao administrador o status operacional de mensageria de forma privada e genérica.
3. Manter contas adicionais por telefone e a mesclagem de lucros como regras de backend auditáveis, caso esse fluxo permaneça ativo.
4. Documentar cada mudança de regra de repasse com data de vigência.
5. Manter o painel público do Validade PT260 limitado a informações não sensíveis e a referências de sessão com expiração.
6. Ao ampliar o painel do Validade PT260, consumir somente dados retornados pelo endpoint de sessão e manter qualquer dado operacional identificado no Supabase privado.
7. Publicar a revisão de validity-group-web-session que devolve o relatório filtrado da sessão depois de regularizar a permissão de deploy da conta Supabase.

## Critérios para concluir um item

- Migração e Edge Function publicadas, quando necessárias.
- Interface do GitHub Pages atualizada.
- Fluxo testado em navegador móvel.
- Estado e versão atualizados em `PROJECT_STATUS.md`.




7. Manter a ponte do painel Grupo limitada a comandos explícitos do Android e adicionar comandos somente com implementação nativa correspondente.
8. Criar o backend do Rapidao somente após definir a validação do anunciante, o registro auditável de lance, o encerramento da oferta e o fluxo de pagamento. Exibir IMEI e dados de procedência apenas em uma área autenticada e quando forem necessários à negociação.


