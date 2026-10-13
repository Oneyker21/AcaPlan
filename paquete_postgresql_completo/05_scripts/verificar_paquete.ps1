$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bundleRoot = Join-Path $repoRoot 'paquete_postgresql_completo'
$excludedSegments = @('\.git\', '\node_modules\', '\.expo\', '\paquete_postgresql_completo\')
$sourceFiles = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Filter '*.sql' | Where-Object {
    $fullPath = $_.FullName
    -not ($excludedSegments | Where-Object { $fullPath.Contains($_) })
})
$errors = [System.Collections.Generic.List[string]]::new()

foreach ($source in $sourceFiles) {
    $relative = $source.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
    if ($relative -eq 'Supabase.sql') {
        $packagedPath = Join-Path $bundleRoot '01_esquema_inicial\Supabase.sql'
    } elseif ($relative -match '^supabase[\\/]migrations[\\/]') {
        $packagedPath = Join-Path $bundleRoot (Join-Path '02_migraciones' $source.Name)
    } else {
        $packagedPath = Join-Path $bundleRoot (Join-Path '03_sql_operativos' $relative)
    }

    if (-not (Test-Path -LiteralPath $packagedPath)) {
        $errors.Add("Falta en el paquete: $relative")
        continue
    }

    $sourceHash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
    $packagedHash = (Get-FileHash -LiteralPath $packagedPath -Algorithm SHA256).Hash
    if ($sourceHash -ne $packagedHash) {
        $errors.Add("La copia no coincide con el original: $relative")
    }
}

if ($sourceFiles.Count -ne 11) {
    $errors.Add("Se encontraron $($sourceFiles.Count) SQL originales; revise si falta actualizar el paquete y su manifiesto.")
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "Correcto: $($sourceFiles.Count) archivos SQL originales están incluidos y coinciden con el paquete."
