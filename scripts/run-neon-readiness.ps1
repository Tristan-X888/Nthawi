#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('isolation', 'export', 'capacity')]
    [string]$Mode = 'isolation',
    [string]$AuthorizationId = '',
    [string]$Confirmation = '',
    [string]$EnvironmentDirectory = '',
    [string]$OutputDirectory = '',
    [string]$PgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe',
    [string]$PgRestore = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe',
    [string]$CertificateFile = '',
    [double]$MinCu = 0.25,
    [double]$MaxCu = 1
)

# Phase 4 live acceptance on the REGISTERED TEST BRANCH ONLY. Each mode needs
# its own exact confirmation and an owner authorization reference. Production
# is not a selectable target. Private files are read only after every offline
# argument check passes, and the caller's environment is always restored.

$ErrorActionPreference = 'Stop'
# Dot-sourcing run-neon-database.ps1 binds its own parameter defaults into this
# scope, so capture this invocation's arguments first.
$NeonReadinessInvocation = @{
    Mode = $Mode; AuthorizationId = $AuthorizationId; Confirmation = $Confirmation
    EnvironmentDirectory = $EnvironmentDirectory; OutputDirectory = $OutputDirectory
    PgDump = $PgDump; PgRestore = $PgRestore; CertificateFile = $CertificateFile
    MinCu = $MinCu; MaxCu = $MaxCu
}
$NeonReadinessRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'run-neon-database.ps1')

$NeonReadinessTarget = @{
    ProjectId = 'delicate-feather-83629956'
    BranchId = 'br-rapid-brook-zao6uwya'
    Host = 'ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech'
}
$NeonReadinessOperations = @{
    isolation = 'synthetic-isolation'
    export = 'synthetic-export'
    capacity = 'capacity-read'
}

function Assert-NeonReadinessArguments {
    param([Parameter(Mandatory)][hashtable]$Options)
    $operation = $NeonReadinessOperations[$Options.Mode]
    if (-not $operation) { throw 'Unknown readiness mode.' }
    $expected = $operation + ':' + $NeonReadinessTarget.ProjectId + ':' + $NeonReadinessTarget.BranchId
    if ($Options.Confirmation -cne $expected) { throw 'Explicit registered-test operation confirmation required.' }
    if ($Options.AuthorizationId -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$') { throw 'An owner authorization reference is required.' }
    if ($Options.Mode -in @('isolation', 'export')) {
        if (-not [IO.Path]::IsPathRooted($Options.OutputDirectory) -or
            -not (Test-Path -LiteralPath $Options.OutputDirectory -PathType Container) -or
            (($Options.OutputDirectory -split '[\\/]') -contains '.anchor')) {
            throw 'An existing absolute private evidence directory is required.'
        }
    }
    if ($Options.Mode -eq 'export') {
        foreach ($path in @($Options.PgDump, $Options.PgRestore, $Options.CertificateFile)) {
            if (-not $path -or -not [IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
                throw 'Export requires existing absolute PostgreSQL 18 pg_dump, pg_restore and CA bundle paths.'
            }
        }
    }
    if ($Options.Mode -eq 'capacity') {
        if (-not ($Options.MinCu -ge 0.25 -and $Options.MinCu -le $Options.MaxCu -and $Options.MaxCu -le 16)) {
            throw 'A valid autoscaling range is required (0.25 <= min <= max <= 16).'
        }
    }
    return $operation
}

function Read-NeonExportCredential {
    param([Parameter(Mandatory)][string]$Directory)
    $path = Join-Path $Directory '.env.neon.test.export.local'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Missing private export configuration: .env.neon.test.export.local' }
    $lines = @([IO.File]::ReadAllLines($path, [Text.UTF8Encoding]::new($false, $true)) | Where-Object { $_ -notmatch '^\s*(#.*)?$' })
    if ($lines.Count -ne 1 -or $lines[0] -cnotmatch '^NEON_ACCEPTANCE_ADMIN_URL=(postgresql://[^\s]+)$') {
        throw 'Invalid private export configuration.'
    }
    return $Matches[1]
}

function Invoke-NeonReadiness {
    param([Parameter(Mandatory)][hashtable]$Options)
    $operation = Assert-NeonReadinessArguments -Options $Options
    $directory = if ($Options.EnvironmentDirectory) { $Options.EnvironmentDirectory } else { $NeonReadinessRoot }

    $names = @('NEON_EXPECTED_PROJECT_ID', 'NEON_ACCEPTANCE_ADMIN_URL', 'NEON_ACCEPTANCE_AUTHORIZATION_ID',
        'NEON_ACCEPTANCE_CONFIRMATION', 'NEON_ACCEPTANCE_EVIDENCE_DIRECTORY')
    foreach ($name in [Environment]::GetEnvironmentVariables('Process').Keys) {
        if ($name -match 'DATABASE|(^|_)DB(_|$)|^(?:AUTH|RLS)_TEST_ADMIN_URL$|^NEON(?:_|$)|^PG|^NODE_(?:OPTIONS|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED|USE_SYSTEM_CA)$|^(?:SSL_CERT_FILE|SSL_CERT_DIR|OPENSSL_CONF)$') {
            $names += [string]$name
        }
    }
    $snapshot = @{}
    foreach ($name in ($names | Select-Object -Unique)) { $snapshot[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    $values = $null
    $located = $false
    try {
        foreach ($name in $snapshot.Keys) { Set-NeonProcessEnvironment $name $null }
        $values = Read-NeonTestEnvironment -Directory $directory
        if ($Options.Mode -in @('isolation', 'export')) {
            $values['NEON_ACCEPTANCE_ADMIN_URL'] = Read-NeonExportCredential -Directory $directory
        }
        foreach ($name in $values.Keys) { Set-NeonProcessEnvironment $name $values[$name] }
        Set-NeonProcessEnvironment 'NEON_EXPECTED_PROJECT_ID' $NeonReadinessTarget.ProjectId
        Set-NeonProcessEnvironment 'NEON_ACCEPTANCE_AUTHORIZATION_ID' $Options.AuthorizationId
        Set-NeonProcessEnvironment 'NEON_ACCEPTANCE_CONFIRMATION' $Options.Confirmation
        if ($Options.Mode -eq 'isolation') { Set-NeonProcessEnvironment 'NEON_ACCEPTANCE_EVIDENCE_DIRECTORY' $Options.OutputDirectory }

        Push-Location -LiteralPath $NeonReadinessRoot
        $located = $true
        $node = Join-Path $env:LOCALAPPDATA 'pnpm\nodejs\24.21.0\node.exe'
        if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Managed Node 24.21.0 is required.' }
        $version = & $node --version
        if ($LASTEXITCODE -ne 0 -or $version -cne 'v24.21.0') { throw 'Managed Node version mismatch.' }
        # The barrier, manifest and probes import the compiled database package.
        Invoke-NeonNative -File $NeonPackageManager -Arguments @('--filter', '@nthawi/db', 'build') -Stage 'Database build' | Out-Null

        Write-Host "=== Phase 4 $operation on $($NeonReadinessTarget.BranchId) ===" -ForegroundColor Cyan
        switch ($Options.Mode) {
            'isolation' { & $node 'scripts/neon-live-isolation.mjs' }
            'export' { & $node 'scripts/neon-export.mjs' $Options.OutputDirectory $Options.PgDump $Options.PgRestore $Options.CertificateFile }
            'capacity' { & $node 'scripts/neon-readiness.mjs' '--capacity' ([string]$Options.MinCu) ([string]$Options.MaxCu) }
        }
        if ($LASTEXITCODE -ne 0) { throw "Phase 4 $operation failed; retain its sanitized evidence." }
    } finally {
        foreach ($name in $snapshot.Keys) { Set-NeonProcessEnvironment $name $snapshot[$name] }
        if ($null -ne $values) { $values.Clear() }
        if ($located) { Pop-Location }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    Invoke-NeonReadiness -Options $NeonReadinessInvocation
}
