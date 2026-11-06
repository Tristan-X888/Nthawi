#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Confirmation = '',
    [string]$EnvironmentDirectory = ''
)

# Rotates the four restricted role passwords on the REGISTERED TEST BRANCH
# ONLY (P4-D08) and rewrites the runtime and operator private files. The owner
# credential is fetched from the authenticated Neon CLI into memory, passed to
# Node through this process's environment only, and removed afterwards. The
# export credential (.env.neon.test.export.local) is not changed.

$ErrorActionPreference = 'Stop'
# Dot-sourcing run-neon-database.ps1 binds its own parameter defaults into this
# scope, so capture this invocation's arguments first.
$NeonRotationInvocation = @{ Confirmation = $Confirmation; EnvironmentDirectory = $EnvironmentDirectory }
$NeonRotationRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'run-neon-database.ps1')

$NeonRotationTarget = @{
    ProjectId = 'delicate-feather-83629956'
    BranchId = 'br-rapid-brook-zao6uwya'
    Host = 'ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech'
}
$NeonRotationConfirmation = 'rotate-role-passwords:' + $NeonRotationTarget.ProjectId + ':' + $NeonRotationTarget.BranchId
$NeonRotationFiles = @('.env.neon.test.runtime.local', '.env.neon.test.operator.local', '.env.neon.test.export.local')

function Get-NeonRotationOwnerUrl {
    # Credential output and native diagnostics stay in memory, never logs.
    $PSNativeCommandUseErrorActionPreference = $false
    $ErrorActionPreference = 'Continue'
    $output = @(& neon connection-string $NeonRotationTarget.BranchId --project-id $NeonRotationTarget.ProjectId --database-name neondb --role-name neondb_owner --ssl verify-full --no-color 2>&1)
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    try {
        if ($exitCode -ne 0) { throw 'Owner credential lookup failed.' }
        $lines = @($output | ForEach-Object { [regex]::Replace($_.ToString(), '\x1B\[[0-?]*[ -/]*[@-~]', '') } | Where-Object { $_ -match '^postgres(?:ql)?://' })
        if ($lines.Count -ne 1) { throw 'Unexpected owner credential response.' }
        $uri = [Uri]::new($lines[0])
        $userInfo = $uri.UserInfo -split ':', 2
        if ($uri.Host -cne $NeonRotationTarget.Host -or $uri.AbsolutePath -cne '/neondb' -or
            $uri.Port -notin @(-1, 5432) -or $uri.Scheme -notin @('postgres', 'postgresql') -or
            $userInfo.Count -ne 2 -or $userInfo[0] -cne 'neondb_owner' -or
            [string]::IsNullOrEmpty($userInfo[1]) -or $uri.Fragment) { throw 'Owner credential target mismatch.' }
        foreach ($option in @($uri.Query.TrimStart('?') -split '&')) {
            if ($option -cnotin @('sslmode=verify-full', 'channel_binding=require')) { throw 'Unexpected owner connection override.' }
        }
        if ($uri.Query -notmatch '(?:^\?|&)sslmode=verify-full(?:&|$)') { throw 'Verified TLS is required.' }
        return 'postgresql://' + $uri.UserInfo + '@' + $NeonRotationTarget.Host + ':5432/neondb?sslmode=verify-full'
    } finally {
        $output = $null; $lines = $null; $uri = $null; $userInfo = $null
    }
}

function Invoke-NeonCredentialRotation {
    param([Parameter(Mandatory)][hashtable]$Options)
    if ($Options.Confirmation -cne $NeonRotationConfirmation) { throw 'Explicit registered-test rotation confirmation required.' }
    $directory = if ($Options.EnvironmentDirectory) { $Options.EnvironmentDirectory } else { $NeonRotationRoot }
    try { $directory = (Resolve-Path -LiteralPath $directory -ErrorAction Stop).ProviderPath }
    catch { throw 'The private Neon test configuration directory is missing.' }
    foreach ($name in $NeonRotationFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $directory $name) -PathType Leaf)) { throw ('Missing private Neon test configuration: ' + $name) }
    }
    if (-not (Get-Command neon -ErrorAction SilentlyContinue)) { throw 'The authenticated Neon CLI is required.' }

    $names = @('NEON_ROTATION_OWNER_URL', 'NEON_ROTATION_CONFIRMATION')
    foreach ($name in [Environment]::GetEnvironmentVariables('Process').Keys) {
        if ($name -match 'DATABASE|(^|_)DB(_|$)|^(?:AUTH|RLS)_TEST_ADMIN_URL$|^NEON(?:_|$)|^PG|^NODE_(?:OPTIONS|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED|USE_SYSTEM_CA)$|^(?:SSL_CERT_FILE|SSL_CERT_DIR|OPENSSL_CONF)$') { $names += [string]$name }
    }
    $snapshot = @{}
    foreach ($name in ($names | Select-Object -Unique)) { $snapshot[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    $located = $false
    $rotated = $false
    try {
        foreach ($name in $snapshot.Keys) { Set-NeonProcessEnvironment $name $null }
        Push-Location -LiteralPath $NeonRotationRoot
        $located = $true
        $nodeLines = @(Invoke-NeonNative -File $NeonPackageManager -Arguments @('exec', 'node', '-p', 'process.execPath') -Stage 'Node lookup')
        if ($nodeLines.Count -eq 0) { throw 'Cannot locate the managed Node executable.' }
        $node = ([string]$nodeLines[-1]).Trim()
        $version = ((Invoke-NeonNative -File $node -Arguments @('--version') -Stage 'Node version') | Out-String).Trim()
        if ($version -cne 'v24.21.0') { throw 'The repository-managed Node v24.21.0 is required.' }

        Set-NeonProcessEnvironment 'NEON_ROTATION_OWNER_URL' (Get-NeonRotationOwnerUrl)
        Set-NeonProcessEnvironment 'NEON_ROTATION_CONFIRMATION' $NeonRotationConfirmation
        Write-Host "=== Rotate restricted role passwords on $($NeonRotationTarget.BranchId) ===" -ForegroundColor Cyan
        $PSNativeCommandUseErrorActionPreference = $false
        $ErrorActionPreference = 'Continue'
        $output = @(& $node 'scripts/neon-rotate-test-credentials.mjs' $directory 2>&1)
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        foreach ($item in $output) {
            foreach ($line in ($item.ToString() -split '\r?\n')) {
                # Only the bounded result and diagnostic formats are printed.
                if ($line -match '^NEON_ROLE_PASSWORDS_ROTATED roles=4 distinct=true verified=true$' -or
                    $line -match '^code=NEON_[A-Z_]+ stage=[a-z0-9:-]+$') { Write-Host $line }
            }
        }
        $output = $null
        if ($exitCode -ne 0) { throw "Role password rotation failed with exit code $exitCode." }
        $rotated = $true
    } finally {
        foreach ($name in $snapshot.Keys) { Set-NeonProcessEnvironment $name $snapshot[$name] }
        if ($located) { Pop-Location }
    }
    if ($rotated) {
        # Offline proof that the rewritten files satisfy the shared guard,
        # including distinct passwords. No SQL runs here.
        Invoke-NeonDatabase -Mode check-config -Target test -EnvironmentDirectory $directory
        Write-Output 'NEON_TEST_CREDENTIAL_ROTATION_COMPLETED'
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    Invoke-NeonCredentialRotation -Options $NeonRotationInvocation
}
