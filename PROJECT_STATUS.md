# Urtador — estado atual

Atualizado em 23/10/2026.

## Produto

- Entrada pública principal: `https://kuttenc.github.io/`
- Compatibilidade de links existentes: `https://kuttenc.github.io/urtador/`
- Repositório público: `https://github.com/kuttenc/urtador`
- O produto cria links curtos, registra visitas qualificadas, mantém saldo e oferece painel administrativo.
- A página pública `rapidao/` usa a identidade **Leilão Rapidão** e apresenta anúncios unitários, encaminhando a autenticação para o fluxo OTP já existente no Urtador. O primeiro anúncio é um iPhone 12 usado com lance mínimo declarado de R$ 234,00. Ela não aceita pagamentos, não reserva itens e não grava lances enquanto não houver backend próprio e verificação do anunciante.
- A extensão local do Chrome em `rapidao-importador-chrome/` cria rascunhos manuais de anúncios próprios com categoria, nome, lote, descrição, lance mínimo e até três fotos. Os dados ficam somente no navegador e podem ser exportados em JSON; ela não acessa páginas externas, não publica anúncios e não registra lances.
- O Rapidao requer aceite local dos próprios termos e da política de privacidade antes de abrir o login ou o convite externo. O aceite fica apenas no navegador; a página não coleta identificação, documentos ou dados de pagamento.
- Usuários autenticados podem abrir `rapidao/perfil/` pelo botão Rapidao acima de Saque Pix. O painel confirmado grava somente telefone mascarado, número da conta e expiração em `sessionStorage` antes de abrir a página; o perfil não recebe token, senha ou OTP na URL e não faz chamada com dados completos do painel.
- **Separação de Supabase:** o Urtador existente permanece no projeto `ggufcvrwctieacvbbwim`, como definido em `assets/config.js` e no workflow de backend. O Leilão Rapidão pode usar o projeto isolado `suipuquznkksgrkchqrv` para tabelas e funções próprias, sem alterar contas, links, OTP ou dados financeiros do Urtador. A conta/e-mail administrativa do projeto antigo não está registrada no repositório; consulte o seletor de organização/projetos no painel Supabase para identificá-la.
- Em 19/10/2026, a arte lateral do acesso foi removida e o painel recebeu a identidade Neon: superfícies pretas, sinalização vermelha e contornos azuis luminosos.
- O caminho público `validade-pt260/` é o painel integrado do Validade PT260. Ele é aberto pelo app com uma referência opaca de sessão e não recebe telefone, IP, credenciais ou identificadores de aparelho.

## Painel público do Validade PT260

- Fonte: `validade-pt260/index.html`, `validade-pt260/styles.css` e `validade-pt260/app.js`.
- URL publicada: `https://kuttenc.github.io/urtador/validade-pt260/`.
- A página só reconhece uma sessão quando recebe `?s=<referência UUID>` emitida pelo app. Sem essa referência, mostra a orientação para abrir pelo aplicativo.
- A página chama `validity-group-web-session` com `GET`; a resposta contém idioma, expiração e as coletas filtradas da própria sessão. Nunca incluir telefone, IP, dados de dispositivo, chaves do Supabase, URLs internas ou segredos no JavaScript público. A função de relatórios foi publicada em 22/10/2026.
- O painel apresenta relatórios da própria sessão com filtros **Hoje**, **7 dias** e **Todas**. A lista mostra item, origem, destino, quantidade e horário, sem devolver telefone, IP ou dados do aparelho ao GitHub Pages. A retenção operacional dos eventos fica no Supabase.
- `deploy-pages.yml` precisa manter a cópia `cp -R validade-pt260 _site/validade-pt260`; sem essa linha a pasta existe no Git, mas não chega ao GitHub Pages.
- Alterações nesses três arquivos podem ser publicadas via `main` sem gerar APK/AAB. A integração nativa, a câmera e a sessão inicial pertencem ao projeto `ValidadePRODark`.
- No app 1.25.31 ou superior, a página integrada pode solicitar somente duas ações nativas por ponte: abrir a coleta pela câmera e imprimir os eventos selecionados pelo seletor de impressão do Android. A página não recebe permissões, dados pessoais ou credenciais.

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




