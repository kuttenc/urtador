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



9. Caso seja necessário registrar aceite de termos para lances ou pagamentos, implementar esse registro no backend com versão dos termos, data, conta autenticada e política de retenção; o aceite local atual é apenas para navegar na página estática.

10. Incluir no perfil Rapidao histórico de anúncios e lances somente depois que as tabelas, regras de autorização, retenção e auditoria do módulo de lances forem publicadas.

11. Antes de usar comparações de mercado ou alegações de liderança no Leilão Rapidão, reunir evidência objetiva e manter a data e a fonte da comparação.
12. Criar o catálogo e lances do Leilão Rapidão no projeto Supabase isolado `suipuquznkksgrkchqrv`, com autenticação própria ou uma ponte autorizada pelo backend do Urtador. Não mover o Urtador existente de `ggufcvrwctieacvbbwim` sem migração planejada de usuários, sessões, links e regras financeiras.

13. Integrar o importador manual do Chrome a um endpoint autenticado do projeto isolado do Leilão Rapidão, com upload de fotos em armazenamento privado, revisão antes de publicar, trilha de auditoria e validação de titularidade do anunciante.
