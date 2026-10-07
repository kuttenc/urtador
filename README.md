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
| `KUTT_AD_NOTIFICATION_GROUP_ID` | ID do grupo WhatsApp que recebe avisos após salvar anúncios |
| `OWNER_PHONE` | Telefone administrador em formato internacional, por exemplo `5511989346164` |
| `OTP_PEPPER` | Segredo aleatório longo para proteger hashes dos códigos |
| `PUBLIC_BASE_URL` | `https://kuttenc.github.io/urtador` |
| `ALLOWED_ORIGINS` | `https://kuttenc.github.io` |

Depois, com o Supabase CLI autenticado em uma conta que tenha acesso ao projeto correto, publique a função com verificação JWT desativada na camada do gateway. A própria função faz a autenticação por sessão após o OTP:

```powershell
npx supabase@latest functions deploy kutt-short-links --project-ref ggufcvrwctieacvbbwim --no-verify-jwt
```

As migrações SQL criam as tabelas e políticas necessárias. As migrações `202610070001`–`202610070004` adicionam configuração de anúncios, taxas individuais de repasse e recuperação segura de senha; aplique-as antes de publicar a Edge Function atualizada.

## Acesso e pagamentos

No primeiro acesso, um código de seis dígitos enviado pelo WhatsApp confirma o telefone e libera o cadastro de senha. A senha é armazenada como hash PBKDF2-SHA-256 com salt aleatório, nunca em texto aberto. Nos 48 horas após cada verificação do WhatsApp, a senha permite iniciar uma nova sessão; após esse prazo, a senha continua obrigatória e o sistema envia um novo código ao WhatsApp. Cada sessão expira em três horas. O telefone `OWNER_PHONE` é o único administrador; usuários comuns só veem os próprios links, cadastram a própria chave Pix e solicitam saque. O administrador confere a solicitação, aprova, faz o Pix por fora e marca como pago no painel.

O valor-base é R$ 70 por mil visitas qualificadas e únicas por usuário, deduplicadas por IP e dia, excluindo robôs e o IP de criação do link. Administradores podem ajustar de 0% a 100% do valor-base para cada conta. A nova taxa é registrada em cada nova visita elegível; visitas anteriores mantêm a taxa que tinham. Isso não é o CPM real nem a receita de anúncios do Google AdSense.

## Anúncios

O administrador configura Auto ads do AdSense e até seis banners Adsterra no painel. Na `guia.html`, no máximo três banners claramente identificados como publicidade aparecem em posições espaçadas; as unidades configuradas alternam diariamente. Anúncios não são obrigatórios nem condicionam o acesso aos links. As etapas de redirecionamento não têm anúncios, temporizadores ou bloqueios. Banners Adsterra são aceitos apenas como configuração validada de chave, tamanho e host permitido; scripts arbitrários não são executados.

Cada banner pode ser identificado como pertencente ao administrador ou ao Matheus para organizar a divisão entre sócios. Essa marcação não representa receita apurada pelo fornecedor. A prévia administrativa mostra o espaço e o tamanho do banner sem executar o script. O valor-base interno de repasse por mil visitas qualificadas pode ser ajustado; cada visita mantém o valor e o percentual vigentes quando foi registrada. Essa regra não é o CPM real do provedor de anúncios.

## Teste local

Abra `index.html` diretamente no navegador ou sirva a pasta com qualquer servidor estatico.

A migração `202610070002` adiciona títulos obrigatórios para fornecedores/anúncios ativos; AdSense também exige título quando habilitado. A migração `202610070003` adiciona taxas de repasse por usuário e preserva a taxa usada por visita. A migração `202610070004` adiciona campos de controle para recuperação de senha.

Recuperação: pessoas com conta e senha podem solicitar um código WhatsApp de seis dígitos. O código expira em 10 minutos, limita tentativas e libera apenas uma sessão restrita para definir a nova senha; outras sessões são encerradas ao concluir.
