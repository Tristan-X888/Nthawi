$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/write-neon-environment.ps1"
. "$PSScriptRoot/run-neon-database.ps1"

function Assert-NeonCondition($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$environmentPath = Join-Path $NeonRunnerRoot ('.env.neon.test-' + [Guid]::NewGuid().ToString('N'))
$secrets = @{}
$raw = @{}
$snapshot = @{}
try {
    foreach ($kind in @('MIGRATOR', 'AUTH', 'BUSINESS', 'JOBS')) {
        $raw[$kind] = "synthetic'quoted@password #/" + $kind
        $secrets[$kind] = ConvertTo-SecureString $raw[$kind] -AsPlainText -Force
    }
    Write-NeonEnvironment -HostName 'ep-test-example.us-east-2.aws.neon.tech' -EnvironmentPath $environmentPath -Passwords $secrets
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $acl = Get-Acl -LiteralPath $environmentPath
        $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
        Assert-NeonCondition ($acl.AreAccessRulesProtected -and $rules.Count -eq 1 -and $rules[0].IdentityReference -eq [Security.Principal.WindowsIdentity]::GetCurrent().User) 'Credential file is readable by another principal.'
    }
    $values = Read-NeonOperatorEnvironment $environmentPath
    foreach ($name in $values.Keys) {
        $snapshot[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    $snapshot.PGPASSWORD = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
    $snapshot.DATABASE_AUTH_PASSWORD = [Environment]::GetEnvironmentVariable('DATABASE_AUTH_PASSWORD', 'Process')
    $names = @{ MIGRATOR = 'DATABASE_MIGRATION_URL'; AUTH = 'AUTH_DATABASE_URL'; BUSINESS = 'DATABASE_URL'; JOBS = 'DATABASE_JOBS_URL' }
    foreach ($kind in $names.Keys) {
        $uri = [Uri]$values[$names[$kind]]
        Assert-NeonCondition ([Uri]::UnescapeDataString(($uri.UserInfo -split ':', 2)[1]) -ceq $raw[$kind]) 'Writer corrupted a quoted password.'
    }
    foreach ($name in $values.Keys) { Set-NeonProcessEnvironment $name $values[$name] }
    Invoke-NeonNative $NeonPackageManager @('exec', 'node', 'scripts/verify-neon-database.mjs', '--check-config')
    $overwriteBlocked = $false
    try { Write-NeonEnvironment -HostName 'ep-test-example.us-east-2.aws.neon.tech' -EnvironmentPath $environmentPath -Passwords $secrets }
    catch { $overwriteBlocked = $true }
    Assert-NeonCondition $overwriteBlocked 'Writer overwrote an existing file without -Force.'
    $originalFile = [IO.File]::ReadAllText($environmentPath)
    foreach ($hostName in @('ep-test-.neon.tech', 'ep--test.neon.tech', 'ep-test.-region.neon.tech', 'ep-test-pooler.us-east-2.aws.neon.tech')) {
        $rejected = $false
        try { Write-NeonEnvironment -HostName $hostName -EnvironmentPath $environmentPath -Passwords $secrets -Force }
        catch { $rejected = $true }
        Assert-NeonCondition $rejected 'Writer accepted an invalid or pooled hostname.'
    }
    $invalidSecret = ConvertTo-SecureString ("synthetic" + [char]0 + "password") -AsPlainText -Force
    try {
        $invalidPasswords = $secrets.Clone()
        $invalidPasswords.MIGRATOR = $invalidSecret
        $rejected = $false
        try { Write-NeonEnvironment -HostName 'ep-test-example.us-east-2.aws.neon.tech' -EnvironmentPath $environmentPath -Passwords $invalidPasswords -Force }
        catch { $rejected = $true }
        Assert-NeonCondition ($rejected -and [IO.File]::ReadAllText($environmentPath) -ceq $originalFile) 'Invalid secret overwrote the operator environment.'
    } finally { $invalidSecret.Dispose() }
    $nativeFailure = $null
    try { Invoke-NeonNative (Get-Process -Id $PID).Path @('-NoProfile', '-Command', "Write-Output 'secret-output-sentinel'; exit 7") }
    catch { $nativeFailure = $_.Exception }
    Assert-NeonCondition ($nativeFailure.Message -match 'exit code 7' -and $nativeFailure.Message -notmatch 'secret-output-sentinel') 'Native failure was not sanitized.'
    $global:LASTEXITCODE = 0

    function psql { throw 'Unexpected psql call outside native boundary.' }
    function Invoke-NeonNative {
        param([string]$File, [string[]]$Arguments)
        $script:Calls.Add(($Arguments -join ' '))
        if (($Arguments -join ' ') -eq 'exec node --version') { return 'v24.21.0' }
        if ($File -eq 'psql') {
            foreach ($kind in $raw.Keys) {
                Assert-NeonCondition ([Environment]::GetEnvironmentVariable('DATABASE_' + $kind + '_PASSWORD', 'Process') -ceq $raw[$kind]) 'Bootstrap password decoding failed.'
            }
        }
        if ($script:FailMigration -and ($Arguments -contains 'packages/db/scripts/migrate.mjs')) { throw 'Synthetic migration failure.' }
    }
    foreach ($mode in @('apply', 'verify', 'bootstrap', 'failure')) {
        $script:Calls = [Collections.Generic.List[string]]::new()
        $script:FailMigration = $mode -eq 'failure'
        Set-NeonProcessEnvironment 'DATABASE_URL' 'original-business-sentinel'
        Set-NeonProcessEnvironment 'PGPASSWORD' 'original-owner-sentinel'
        Set-NeonProcessEnvironment 'DATABASE_AUTH_PASSWORD' $null
        $previousDirectory = (Get-Location).Path
        $failure = $null
        try {
            Invoke-NeonDatabase -EnvironmentPath $environmentPath -VerifyOnly:($mode -eq 'verify') -Bootstrap:($mode -eq 'bootstrap') -RootCertificate (Join-Path $NeonRunnerRoot 'infra/neon/bootstrap.psql') -OwnerPassword $secrets.MIGRATOR
        } catch { $failure = $_.Exception }
        Assert-NeonCondition ($env:DATABASE_URL -ceq 'original-business-sentinel') 'Runner did not restore the operator environment.'
        Assert-NeonCondition ($env:PGPASSWORD -ceq 'original-owner-sentinel') 'Runner did not restore bootstrap credentials.'
        Assert-NeonCondition (-not (Test-Path -LiteralPath 'Env:DATABASE_AUTH_PASSWORD')) 'Runner retained a bootstrap secret.'
        Assert-NeonCondition ((Get-Location).Path -eq $previousDirectory) 'Runner did not restore the working directory.'
        Assert-NeonCondition (($null -ne $failure) -eq ($mode -eq 'failure')) 'Unexpected lifecycle result.'
        $migrations = @($script:Calls | Where-Object { $_ -match 'packages/db/scripts/migrate.mjs' })
        Assert-NeonCondition (($migrations.Count -eq 0) -eq ($mode -eq 'verify')) 'Verify-only mode invoked migrations.'
        if ($mode -eq 'failure') {
            Assert-NeonCondition (@($script:Calls | Where-Object { $_ -match 'provision-runtime|verify-neon-database.mjs$' }).Count -eq 0) 'Runner continued after migration failure.'
        }
    }
    Write-Host 'Neon PowerShell writer and lifecycle regression checks passed.'
} finally {
    foreach ($name in $snapshot.Keys) { Set-NeonProcessEnvironment $name $snapshot[$name] }
    foreach ($secret in $secrets.Values) { $secret.Dispose() }
    if (Test-Path -LiteralPath $environmentPath) { Remove-Item -LiteralPath $environmentPath -Force }
    $global:LASTEXITCODE = 0
}
