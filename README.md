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

Configure os secrets da funcao antes do deploy:

```powershell
supabase secrets set SUPABASE_URL="https://SEU-PROJETO.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE_KEY"
supabase secrets set PUBLIC_BASE_URL="https://kuttenc.github.io/urtador"
supabase secrets set ALLOWED_ORIGINS="https://kuttenc.github.io,http://localhost:4173,http://127.0.0.1:4173"
```

Depois aplique a migracao e publique a funcao:

```powershell
supabase db push
supabase functions deploy kutt-short-links --no-verify-jwt
```

## Teste local

Abra `index.html` diretamente no navegador ou sirva a pasta com qualquer servidor estatico.

