#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('check-config', 'verify', 'migrate')]
    [string]$Mode = 'verify',
    [string]$Target = 'test',
    [string]$EnvironmentDirectory = ''
)

$ErrorActionPreference = 'Stop'
$NeonRunnerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($EnvironmentDirectory)) { $EnvironmentDirectory = $NeonRunnerRoot }
$NeonPackageManager = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { 'pnpm.cmd' } else { 'pnpm' }

function Set-NeonProcessEnvironment {
    param(
        [Parameter(Mandatory)][string]$Name,
        [AllowNull()][AllowEmptyString()][object]$Value
    )
    $path = 'Env:' + $Name
    if ($null -eq $Value) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
    } else {
        Set-Item -LiteralPath $path -Value $Value
    }
}

function Read-NeonTestEnvironment {
    param([Parameter(Mandatory)][string]$Directory)

    try { $Directory = (Resolve-Path -LiteralPath $Directory -ErrorAction Stop).ProviderPath }
    catch { throw 'The Neon test configuration directory is missing.' }
    $files = @(
        @{ Name = '.env.neon.test.runtime.local'; Keys = @('AUTH_DATABASE_URL', 'DATABASE_URL') }
        @{ Name = '.env.neon.test.operator.local'; Keys = @(
            'DATABASE_MIGRATION_URL', 'JOBS_DATABASE_URL',
            'DATABASE_MIGRATOR_ROLE', 'DATABASE_AUTH_ROLE',
            'DATABASE_BUSINESS_ROLE', 'DATABASE_JOBS_ROLE',
            'NEON_TARGET', 'NEON_EXPECTED_BRANCH_ID'
        ) }
    )
    # A deliberately strict dotenv subset: literal values, optional whole-value
    # quotes/export, and comments. No evaluation, interpolation, or multiline secrets.
    $assignment = '^\s*(?:export\s+)?(?<name>[A-Z_][A-Z0-9_]*)\s*=\s*(?:"(?<double>[^"\\\r\n]*)"|''(?<single>[^''\r\n]*)''|(?<bare>[^\s#''"]+))\s*(?:#.*)?$'
    $values = @{}
    foreach ($file in $files) {
        $path = Join-Path $Directory $file.Name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw ('Missing Neon test configuration: ' + $file.Name)
        }
        $lineNumber = 0
        try { $lines = [IO.File]::ReadAllLines($path, [Text.UTF8Encoding]::new($false, $true)) }
        catch { throw ('Cannot read Neon test configuration: ' + $file.Name) }
        $count = 0
        foreach ($line in $lines) {
            $lineNumber++
            if ($line -match '^\s*(#.*)?$') { continue }
            $match = [regex]::Match($line, $assignment)
            if (-not $match.Success -or $line -match '[\x00-\x08\x0B\x0C\x0E-\x1F]') {
                throw ('Invalid Neon test configuration: ' + $file.Name + ' line ' + $lineNumber)
            }
            $name = $match.Groups['name'].Value
            if ($file.Keys -cnotcontains $name -or $values.ContainsKey($name)) {
                throw ('Unexpected or duplicate key in Neon test configuration: ' + $file.Name)
            }
            $value = $match.Groups['bare'].Value
            foreach ($quote in @('single', 'double')) {
                if ($match.Groups[$quote].Success) { $value = $match.Groups[$quote].Value }
            }
            if ([string]::IsNullOrWhiteSpace($value)) {
                throw ('Empty value in Neon test configuration: ' + $file.Name)
            }
            $values[$name] = $value
            $count++
        }
        if ($count -ne $file.Keys.Count) {
            throw ('Missing key in Neon test configuration: ' + $file.Name)
        }
    }
    if ($values.NEON_TARGET -cne 'test') { throw 'The Neon runner refuses production and accepts only NEON_TARGET=test.' }
    return $values
}

function Invoke-NeonNative {
    param(
        [Parameter(Mandatory)][string]$File,
        [string[]]$Arguments,
        [Parameter(Mandatory)][string]$Stage
    )
    # Normalize Windows PowerShell and PowerShell 7 native exit handling.
    $PSNativeCommandUseErrorActionPreference = $false
    $ErrorActionPreference = 'Continue'
    if (-not (Get-Command $File -CommandType Application -ErrorAction SilentlyContinue)) {
        throw "$Stage failed: required executable is unavailable."
    }
    Write-Host "=== $Stage ===" -ForegroundColor Cyan
    try {
        $output = @(& $File @Arguments 2>&1)
        $nativeExitCode = $LASTEXITCODE
    } catch { throw "$Stage could not start." }

    $offline = $Stage -in @('Node lookup', 'Node version', 'Schema check', 'Manifest check', 'Database build', 'Neon regression tests', 'API build', 'API regression tests')
    $safeOutput = @()
    foreach ($item in $output) {
        foreach ($line in ($item.ToString() -split '\r?\n')) {
            # Live commands may include passwords in exception details. Only our
            # deliberately bounded diagnostic format is allowed through.
            if ($offline -or
                $line -match '^NEON_[A-Z_]+(?: (?:kind|target)=[a-z0-9_-]+)*$' -or
                $line -match '^code=NEON_[A-Z_]+ stage=[a-z0-9:_-]+ postgres_code=(?:[A-Z0-9]{5}|none) network_code=(?:E[A-Z0-9_]+|none)$' -or
                $line -match '^NEON_API_ACCEPTANCE_PASSED shutdown_mode=(?:os-sigterm|ipc-sigterm-hook)$' -or
                $line -match '^code=NEON_API_ACCEPTANCE_FAILED stage=[a-z0-9/_-]+$' -or
                $line -eq 'Database runtime grants provisioned') {
                $safeOutput += $line
            }
        }
    }
    if ($nativeExitCode -ne 0) {
        foreach ($line in $safeOutput) { Write-Host $line }
        throw "$Stage failed with exit code $nativeExitCode."
    }
    return $safeOutput
}

function Invoke-NeonDatabase {
    param(
        [ValidateSet('check-config', 'verify', 'migrate')][string]$Mode = 'verify',
        [string]$Target = 'test',
        [string]$EnvironmentDirectory = $NeonRunnerRoot
    )
    if ($Target -cne 'test') { throw 'The Neon runner accepts only -Target test. Production execution is refused.' }

    # Include absent required names so credentials loaded by this invocation are
    # removed afterwards, alongside restoring every conflicting inherited value.
    $names = @(
        'DATABASE_URL', 'AUTH_DATABASE_URL', 'DATABASE_MIGRATION_URL', 'JOBS_DATABASE_URL',
        'DATABASE_MIGRATOR_ROLE', 'DATABASE_AUTH_ROLE', 'DATABASE_BUSINESS_ROLE', 'DATABASE_JOBS_ROLE',
        'NEON_TARGET', 'NEON_EXPECTED_BRANCH_ID'
    )
    foreach ($name in [Environment]::GetEnvironmentVariables('Process').Keys) {
        if ($name -match 'DATABASE|(^|_)DB(_|$)|^(?:AUTH|RLS)_TEST_ADMIN_URL$|^NEON(?:_|$)|^PG|^NODE_(?:OPTIONS|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED|USE_SYSTEM_CA)$|^(?:SSL_CERT_FILE|SSL_CERT_DIR|OPENSSL_CONF)$') { $names += [string]$name }
    }
    $snapshot = @{}
    foreach ($name in $names) {
        $snapshot[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    $values = $null
    $locationPushed = $false
    try {
        foreach ($name in $snapshot.Keys) { Set-NeonProcessEnvironment $name $null }
        $values = Read-NeonTestEnvironment -Directory $EnvironmentDirectory
        foreach ($name in $values.Keys) { Set-NeonProcessEnvironment $name $values[$name] }
        Push-Location -LiteralPath $NeonRunnerRoot
        $locationPushed = $true

        $nodeLines = @(Invoke-NeonNative -File $NeonPackageManager -Arguments @('exec', 'node', '-p', 'process.execPath') -Stage 'Node lookup')
        if ($nodeLines.Count -eq 0) { throw 'Cannot locate the managed Node executable.' }
        $projectNode = ([string]$nodeLines[-1]).Trim()
        if (-not (Test-Path -LiteralPath $projectNode -PathType Leaf)) { throw 'Managed Node executable is missing.' }
        $version = ((Invoke-NeonNative -File $projectNode -Arguments @('--version') -Stage 'Node version') | Out-String).Trim()
        if ($version -cne 'v24.21.0') { throw 'The repository-managed Node v24.21.0 is required.' }

        # This command imports no built database package and executes no SQL.
        # The shared JS guard is the authority for the branch, host, roles and TLS.
        Invoke-NeonNative -File $projectNode -Arguments @('scripts/verify-neon-database.mjs', '--check-config') -Stage 'Test target configuration'
        if ($Mode -eq 'check-config') { return }

        Invoke-NeonNative -File $NeonPackageManager -Arguments @('--filter', '@nthawi/db', 'db:check') -Stage 'Schema check'
        Invoke-NeonNative -File $NeonPackageManager -Arguments @('--filter', '@nthawi/db', 'db:manifest:check') -Stage 'Manifest check'
        Invoke-NeonNative -File $NeonPackageManager -Arguments @('--filter', '@nthawi/db', 'build') -Stage 'Database build'
        Invoke-NeonNative -File $projectNode -Arguments @('--test', 'scripts/neon-targets.test.mjs', 'scripts/verify-neon-database.test.mjs') -Stage 'Neon regression tests'
        if ($Mode -eq 'migrate') {
            Invoke-NeonNative -File $projectNode -Arguments @('scripts/verify-neon-database.mjs', '--before-migrate') -Stage 'Migration preflight'
            Invoke-NeonNative -File $projectNode -Arguments @('packages/db/scripts/migrate.mjs') -Stage 'Migration'
            Invoke-NeonNative -File $projectNode -Arguments @('packages/db/scripts/provision-runtime.mjs') -Stage 'Runtime grants'
        }
        Invoke-NeonNative -File $projectNode -Arguments @('scripts/verify-neon-database.mjs', '--after-migrate') -Stage 'Database acceptance'
        Invoke-NeonNative -File $NeonPackageManager -Arguments @('exec', 'turbo', 'run', 'build', '--filter=@nthawi/api') -Stage 'API build'
        Invoke-NeonNative -File $projectNode -Arguments @('--test', 'scripts/verify-neon-api.test.mjs') -Stage 'API regression tests'
        Invoke-NeonNative -File $projectNode -Arguments @('scripts/verify-neon-api.mjs') -Stage 'Compiled API acceptance'
        Write-Output 'Neon isolated database and compiled API acceptance passed. Production promotion remains a separate gate.'
    } finally {
        foreach ($name in $snapshot.Keys) { Set-NeonProcessEnvironment $name $snapshot[$name] }
        if ($null -ne $values) { $values.Clear() }
        if ($locationPushed) { Pop-Location }
    }
}

# Importing this script never opens a database or reads developer credentials.
if ($MyInvocation.InvocationName -ne '.') {
    Invoke-NeonDatabase -Mode $Mode -Target $Target -EnvironmentDirectory $EnvironmentDirectory
}
