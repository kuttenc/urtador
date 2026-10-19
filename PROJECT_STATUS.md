# Urtador — estado atual

Atualizado em 19/10/2026.

## Produto

- Entrada pública principal: `https://kuttenc.github.io/`
- Compatibilidade de links existentes: `https://kuttenc.github.io/urtador/`
- Repositório público: `https://github.com/kuttenc/urtador`
- O produto cria links curtos, registra visitas qualificadas, mantém saldo e oferece painel administrativo.

## Acesso

- O fluxo de acesso usa telefone, senha e código de seis dígitos conforme a regra server-side vigente.
- Quem cria um link antes do cadastro pode vinculá-lo ao painel no mesmo navegador: informa telefone com DDI/DDD, entra no grupo OTP, confirma o código e cria a senha. A função anexa os links convidados à conta criada.
- Após criar o primeiro link convidado, a tela exibe uma prévia do painel e uma janela visual de cinco minutos para informar o telefone. O prazo só fecha o atalho visual; o link convidado permanece no navegador para vínculo posterior pelo acesso principal.
- Mensagens de falha devem ser neutras: não citar Green API, nome de instância, token, fila ou detalhes de infraestrutura.
- O link da comunidade pode aparecer como orientação de acesso, mas o backend deve continuar sendo a fonte de verdade de autorização e limite de tentativas.

## Repasses e painel

- A regra de repasse deve ser avaliada no backend e registrada por visita para evitar recalcular registros antigos com uma tarifa nova.
- O painel pode apresentar projeções, mas deve diferenciá-las de valores confirmados de anúncios e saques.

## Publicidade e links

- A página curta pode exibir um banner Adsterra identificado; o anúncio não bloqueia o redirecionamento, não exige interação e não usa temporizador.
- O carregamento inicial de cada rota curta abre uma janela fixa de 15 minutos por hash de IP e link. Depois disso a rota volta à página principal, que restaura o painel quando existir sessão válida.
- Quando as chaves `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` estiverem configuradas no Supabase, cada rota curta exibe o Cloudflare Turnstile antes de liberar o destino. A validação acontece no backend.
- Todo destino cadastrado deve ser validado no servidor antes de ser publicado como link curto.

## Verificação antes de publicar

1. Confirmar migrações aplicadas no projeto Supabase correto.
2. Testar criação, redirecionamento e painel com conta de teste.
3. Conferir a página publicada sem cache, em navegador móvel.
4. Atualizar este arquivo com a versão, decisão e pendência que restar.

