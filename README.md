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
| `GREEN_API_URL` | URL da conta Green API usada para enviar os códigos |
| `GREEN_API_INSTANCE_ID` | Instância autorizada do WhatsApp |
| `GREEN_API_TOKEN` | Token da instância, guardado só no servidor |
| `OWNER_PHONE` | Telefone administrador em formato internacional, por exemplo `5511989346164` |
| `OTP_PEPPER` | Segredo aleatório longo para proteger hashes dos códigos |
| `PUBLIC_BASE_URL` | `https://kuttenc.github.io/urtador` |
| `ALLOWED_ORIGINS` | `https://kuttenc.github.io` |

Depois, com o Supabase CLI autenticado em uma conta que tenha acesso ao projeto correto, publique a função com verificação JWT desativada na camada do gateway. A própria função faz a autenticação por sessão após o OTP:

```powershell
npx supabase@latest functions deploy kutt-short-links --project-ref ggufcvrwctieacvbbwim --no-verify-jwt
```

As migrações SQL criam as tabelas e políticas necessárias. A migração `202610070001` adiciona a configuração administrativa de publicidade; ela deve ser aplicada antes de publicar a Edge Function atualizada.

## Acesso e pagamentos

No primeiro acesso, um código de seis dígitos enviado pelo WhatsApp confirma o telefone e libera o cadastro de senha. A senha é armazenada como hash PBKDF2-SHA-256 com salt aleatório, nunca em texto aberto. Nos 48 horas após cada verificação do WhatsApp, a senha permite iniciar uma nova sessão; após esse prazo, a senha continua obrigatória e o sistema envia um novo código ao WhatsApp. Cada sessão expira em três horas. O telefone `OWNER_PHONE` é o único administrador; usuários comuns só veem os próprios links, cadastram a própria chave Pix e solicitam saque. O administrador confere a solicitação, aprova, faz o Pix por fora e marca como pago no painel.

O painel calcula R$ 70 por mil visitas qualificadas e únicas por usuário, deduplicadas por IP e dia, excluindo robôs e o IP de criação do link. Essa regra deve ser mantida separada de impressões/cliques do Google AdSense; a página de redirecionamento não carrega código AdSense.

## Anúncios

O administrador configura Auto ads do AdSense e até seis banners Adsterra no painel. Os anúncios são exibidos somente na página de conteúdo `guia.html`; as etapas de redirecionamento não têm anúncios, temporizadores ou bloqueios. Banners Adsterra são aceitos apenas como configuração validada de chave, tamanho e host permitido; scripts arbitrários não são executados.

## Teste local

Abra `index.html` diretamente no navegador ou sirva a pasta com qualquer servidor estatico.
