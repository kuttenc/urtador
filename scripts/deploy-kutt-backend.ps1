$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $repoRoot
$kuttEnvPath = Join-Path $workspaceRoot '.envkutt'
$projectRef = 'ggufcvrwctieacvbbwim'

function Read-EnvFile([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Arquivo de configuração local não encontrado: $path" }
  $result = @{}
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $result[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $result
}

$kutt = Read-EnvFile $kuttEnvPath
if (-not $kutt['KUTT_SUPABASE_ACCESS_TOKEN']) {
  throw 'Adicione KUTT_SUPABASE_ACCESS_TOKEN ao .envkutt usando um Access Token da conta Supabase que tem acesso ao projeto Kutt. Não envie esse token no chat.'
}
foreach ($name in @('DB_PASSWORD')) {
  if (-not $kutt[$name]) { throw "O .envkutt precisa conter $name." }
}
if (-not $kutt['ADMIN_PHONES']) { throw 'Configure ADMIN_PHONES no .envkutt com os telefones administradores em formato internacional, separados por vírgula.' }
if (-not $kutt['OTP_PEPPER']) {
  $randomBytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
  $pepper = ([System.BitConverter]::ToString($randomBytes) -replace '-', '').ToLowerInvariant()
  Add-Content -LiteralPath $kuttEnvPath -Value "`nOTP_PEPPER=$pepper" -Encoding utf8
  $kutt['OTP_PEPPER'] = $pepper
}

$env:SUPABASE_ACCESS_TOKEN = $kutt['KUTT_SUPABASE_ACCESS_TOKEN']
$secretFile = Join-Path $repoRoot 'supabase\.temp\kutt-secrets.local.env'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $secretFile) | Out-Null
$secretLines = @(
  "ADMIN_PHONES=$($kutt['ADMIN_PHONES'])",
  "OTP_PEPPER=$($kutt['OTP_PEPPER'])",
  'PUBLIC_BASE_URL=https://kuttenc.github.io/urtador',
  'ALLOWED_ORIGINS=https://kuttenc.github.io'
)
if ($kutt['OWNER_PHONE']) { $secretLines += "OWNER_PHONE=$($kutt['OWNER_PHONE'])" }
if ($kutt['KUTT_AD_NOTIFICATION_GROUP_ID']) { $secretLines += "KUTT_AD_NOTIFICATION_GROUP_ID=$($kutt['KUTT_AD_NOTIFICATION_GROUP_ID'])" }
if ($kutt['KUTT_REPORT_CRON_SECRET']) { $secretLines += "KUTT_REPORT_CRON_SECRET=$($kutt['KUTT_REPORT_CRON_SECRET'])" }
$greenApiNames = @('GREEN_API_URL', 'GREEN_API_INSTANCE_ID', 'GREEN_API_TOKEN')
$configuredGreenApiNames = @($greenApiNames | Where-Object { $kutt[$_] })
if ($configuredGreenApiNames.Count -gt 0 -and $configuredGreenApiNames.Count -ne $greenApiNames.Count) {
  throw 'Configure as três variáveis GREEN_API_* no .envkutt ou deixe todas ausentes para preservar a conexão já configurada no Supabase.'
}
if ($configuredGreenApiNames.Count -eq $greenApiNames.Count) {
  foreach ($name in $greenApiNames) { $secretLines += "$name=$($kutt[$name])" }
}
$kuttGreenApiNames = @('KUTT_GREEN_API_URL', 'KUTT_GREEN_API_INSTANCE_ID', 'KUTT_GREEN_API_TOKEN')
$configuredKuttGreenApiNames = @($kuttGreenApiNames | Where-Object { $kutt[$_] })
if ($configuredKuttGreenApiNames.Count -gt 0 -and $configuredKuttGreenApiNames.Count -ne $kuttGreenApiNames.Count) {
  throw 'Configure as três variáveis KUTT_GREEN_API_* no .envkutt ou deixe todas ausentes para manter a configuração atual.'
}
if ($configuredKuttGreenApiNames.Count -eq $kuttGreenApiNames.Count) {
  $secretLines += "GREEN_API_FALLBACK_URL=$($kutt['KUTT_GREEN_API_URL'])"
  $secretLines += "GREEN_API_FALLBACK_INSTANCE_ID=$($kutt['KUTT_GREEN_API_INSTANCE_ID'])"
  $secretLines += "GREEN_API_FALLBACK_TOKEN=$($kutt['KUTT_GREEN_API_TOKEN'])"
}
$googleCredentialsPath = Join-Path $workspaceRoot 'credentials.json'
if (Test-Path -LiteralPath $googleCredentialsPath) {
  $googleCredentials = Get-Content -LiteralPath $googleCredentialsPath -Raw | ConvertFrom-Json
  $googleWebClient = $googleCredentials.web
  if (-not $googleWebClient.client_id -or -not $googleWebClient.client_secret) {
    throw 'credentials.json existe, mas não contém client_id e client_secret de um OAuth Web.'
  }
  $secretLines += "ADSENSE_OAUTH_CLIENT_ID=$($googleWebClient.client_id)"
  $secretLines += "ADSENSE_OAUTH_CLIENT_SECRET=$($googleWebClient.client_secret)"
  $secretLines += 'ADSENSE_PUBLISHER_ID=pub-6464589391694014'
}
$localEnvPath = Join-Path $workspaceRoot '.env'
if (Test-Path -LiteralPath $localEnvPath) {
  $localSecrets = Read-EnvFile $localEnvPath
  if ($localSecrets['ADSTERRA_API_TOKEN']) {
    $secretLines += "ADSTERRA_API_TOKEN=$($localSecrets['ADSTERRA_API_TOKEN'])"
  }
}
[System.IO.File]::WriteAllLines($secretFile, $secretLines, [System.Text.UTF8Encoding]::new($false))

try {
  Push-Location $repoRoot
  npx --yes supabase@latest link --project-ref $projectRef --password $kutt['DB_PASSWORD']
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível vincular o projeto Supabase. Confira se o token tem acesso ao projeto.' }
  npx --yes supabase@latest db push --linked --password $kutt['DB_PASSWORD']
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível aplicar as migrações pendentes do banco.' }
  npx --yes supabase@latest secrets set --env-file $secretFile --project-ref $projectRef
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar os secrets no Supabase.' }
  npx --yes supabase@latest functions deploy kutt-short-links --project-ref $projectRef --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { throw 'A implantação da Edge Function falhou.' }
  Write-Host 'Edge Function implantada. Teste o painel em https://kuttenc.github.io/urtador/.'
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $secretFile -Force -ErrorAction SilentlyContinue
}
