# Urtador

Encurtador independente para rodar no GitHub Pages com backend no Supabase.

## Enderecos

- Site GitHub Pages: `https://kuttenc.github.io/urtador/`
- Repositorio: `https://github.com/kuttenc/urtador`

## Como funciona

O GitHub Pages entrega a interface e captura rotas como `/urtador/abc123` pelo `404.html`.
A criacao, consulta e contagem de cliques passam pela Edge Function `kutt-short-links`.
Nenhuma senha de banco fica no GitHub ou no navegador.

## Deploy do Supabase

Configure estes secrets em **Supabase → Edge Functions → Secrets** antes de publicar. O `SUPABASE_SERVICE_ROLE_KEY` é fornecido pelo runtime; não coloque essa chave no navegador ou no repositório.

| Secret | Uso |
| --- | --- |
| `GREEN_API_URL` | URL do serviço de mensagens usado para enviar os códigos |
| `GREEN_API_INSTANCE_ID` | Instância autorizada do serviço de mensagens |
| `GREEN_API_TOKEN` | Token da instância, guardado só no servidor |
| `KUTT_AD_NOTIFICATION_GROUP_ID` | ID do grupo WhatsApp que recebe avisos após salvar anúncios |
| `OWNER_PHONE` | Telefone principal de administração em formato internacional |
| `ADMIN_PHONES` | Telefones administradores adicionais separados por vírgulas, em formato internacional |
| `OTP_PEPPER` | Segredo aleatório longo para proteger hashes dos códigos |
| `PUBLIC_BASE_URL` | `https://kuttenc.github.io/urtador` |
| `ALLOWED_ORIGINS` | `https://kuttenc.github.io` |

Depois, com o Supabase CLI autenticado em uma conta que tenha acesso ao projeto correto, publique a função com verificação JWT desativada na camada do gateway. A própria função faz a autenticação por sessão após o OTP:

```powershell
npx supabase@latest functions deploy kutt-short-links --project-ref ggufcvrwctieacvbbwim --no-verify-jwt
```

## Avisos na comunidade do WhatsApp

Para avisos do Urtador, usar a instância de mensagens de fallback do Validade PT260 definida no `.env` local (`GREEN_API_FALLBACK_URL`, `GREEN_API_FALLBACK_INSTANCE_ID`, `GREEN_API_FALLBACK_TOKEN`); o código do chatbot Validade também prioriza essa instância. Não usar as credenciais primárias de logística nem copiar tokens para este repositório. O grupo Kuttencurtador tem o ID `120363430513969812@g.us`.

Antes de enviar, consultar `getGroupData` nessa instância com o ID acima e conferir que o grupo retornado é **Kuttencurtador** e que a instância pode publicar. Depois enviar o texto pelo endpoint `sendMessage` com `chatId` igual ao mesmo ID. Não imprimir URLs com token, valores de tokens, lista de membros nem mensagens privadas nos logs. O envio de 7 de outubro de 2026 confirmou o grupo e foi concluído com sucesso.

As migrações SQL criam as tabelas e políticas necessárias. A migração `202610070007_kutt_atomic_qualified_clicks.sql` mantém o contador confiável e grava clique, saldo e deduplicação numa transação única; aplique-a antes de publicar a Edge Function atualizada.

Links podem ser criados sem cadastro. Um identificador aleatório do navegador é guardado localmente; depois do login no mesmo navegador, a função anexa os links anônimos à conta. O backend guarda somente o hash desse identificador e o hash do IP de criação (para prevenção de abuso); não usa o IP para identificar a conta. A migração `202610070006_guest_link_sessions.sql` adiciona o campo necessário.

## Acesso e pagamentos

No primeiro acesso, o telefone precisa estar entre os membros da comunidade Kuttencurtador. Um código de seis dígitos aparece ali junto do DDD e dos quatro últimos dígitos; só então a pessoa cadastra sua senha. O link para entrar na comunidade aparece na tela de acesso. O envio depende de uma instância de mensagens ativa, configurada nos secrets do Supabase. A senha é armazenada como hash PBKDF2-SHA-256 com salt aleatório, nunca em texto aberto. Nas 48 horas após cada verificação da comunidade, a senha permite iniciar uma nova sessão; após esse prazo, a senha continua obrigatória e o sistema publica um novo código no grupo. Cada sessão expira em três horas. Os telefones em `OWNER_PHONE` e `ADMIN_PHONES` definem os administradores; esses números ficam nos secrets do Supabase, não no repositório público. Usuários comuns só veem os próprios links e cadastram a própria chave Pix. Após acumular R$ 70,00 em visitas qualificadas reais, podem pedir saques de no mínimo R$ 10,00 em múltiplos de R$ 10,00, até três pedidos por dia. O banco aplica os limites de forma atômica. O pedido avisa a comunidade com os quatro últimos dígitos do telefone e o valor. Fabio ou Matheus confere telefone, chave Pix e valor no painel; depois de enviar o Pix manualmente na Cora, um deles clica em “Eu enviei o Pix”. O botão apenas registra a confirmação, não transfere dinheiro.

A API pública documentada pela Cora permite cobranças Pix recebidas e iniciação de certos pagamentos/transferências, mas não documenta transferência Pix de saída para pagar colaboradores. Portanto, os repasses do Urtador seguem manuais no app da Cora até a instituição disponibilizar uma API de saída Pix compatível.

O valor-base é R$ 70 por mil aberturas qualificadas. Conta somente quando a pessoa toca em “Abrir destino”; visualização de página/anúncio não conta. Cada visitante por IP gera no máximo um repasse por colaborador por dia, mesmo que abra vários links dele. Robôs, IP de criação e repetições no mesmo dia não geram repasse. A gravação do clique, contador e saldo é atômica no Supabase para evitar duplicidade ou saldo parcial. Administradores podem ajustar de 0% a 100% do valor-base para cada conta; a taxa vigente fica gravada em cada novo registro. Saques seguem conferência manual. Isso não é o CPM real nem a receita de anúncios do Google AdSense.

O painel administrativo também gera relatórios por período e agrupamento diário, semanal ou mensal. A busca filtra por telefone ou chave Pix; os dados podem ser exportados em CSV ou em folhas individuais para impressão/salvamento como PDF. A opção de PDFs individuais seleciona quem tem estimativa interna acima de R$ 70 no período. O botão de teste cria um documento marcado como simulação com 995 visitas e não grava cliques nem saldo. A previsão de reserva para 7 e 30 dias projeta a média dos últimos sete dias completos e soma o saldo de repasses estimado ainda não marcado como pago. Esses números não são receita confirmada dos fornecedores de anúncios nem uma garantia de quando alguém solicitará saque. O envio de PDFs pelo WhatsApp ainda não está configurado; os documentos são gerados localmente pelo navegador para conferência.

## Anúncios

O administrador configura Auto ads do AdSense e até seis banners Adsterra no painel. Na `guia.html`, no máximo três banners claramente identificados como publicidade aparecem em posições espaçadas; as unidades configuradas alternam diariamente. Anúncios não são obrigatórios nem condicionam o acesso aos links. As etapas de redirecionamento não têm anúncios, temporizadores ou bloqueios. Banners Adsterra são aceitos apenas nos formatos validados de chave, dimensão e caminho `highperformanceformat.com/{chave}/invoke.js` e `bauval.org/22/{chave}`; o anúncio roda isolado em iframe somente na Guia, e scripts arbitrários não são aceitos.

Cada banner pode ser identificado como pertencente ao administrador ou ao Matheus para organizar a divisão entre sócios. Essa marcação não representa receita apurada pelo fornecedor. A prévia administrativa mostra o espaço e o tamanho do banner sem executar o script. O valor-base interno de repasse por mil visitas qualificadas pode ser ajustado; cada visita mantém o valor e o percentual vigentes quando foi registrada. Essa regra não é o CPM real do provedor de anúncios.

## Teste local

Abra `index.html` diretamente no navegador ou sirva a pasta com qualquer servidor estatico.

A migração `202610070002` adiciona títulos obrigatórios para fornecedores/anúncios ativos; AdSense também exige título quando habilitado. A migração `202610070003` adiciona taxas de repasse por usuário e preserva a taxa usada por visita. A migração `202610070004` adiciona campos de controle para recuperação de senha.

Recuperação: pessoas com conta e senha podem solicitar um código WhatsApp de seis dígitos. O código expira em 10 minutos, limita tentativas e libera apenas uma sessão restrita para definir a nova senha; outras sessões são encerradas ao concluir.
