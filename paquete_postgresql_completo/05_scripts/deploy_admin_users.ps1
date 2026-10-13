$ErrorActionPreference = 'Stop'

# This deploys a remote Supabase Edge Function. Run it only after confirming
# that the Supabase CLI is linked to the intended project and account.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$functionSource = Join-Path $repoRoot 'supabase\functions\admin-users\index.ts'

if (-not (Test-Path -LiteralPath $functionSource)) {
    throw "No se encontró la función fuente en: $functionSource"
}

Push-Location $repoRoot
try {
    & npx supabase functions deploy admin-users
    if ($LASTEXITCODE -ne 0) {
        throw "El despliegue de admin-users terminó con código $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
