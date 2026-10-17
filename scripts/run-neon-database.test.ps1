#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
# A missing directory makes an accidental top-level invocation fail safely.
. "$PSScriptRoot/run-neon-database.ps1" -EnvironmentDirectory (Join-Path ([IO.Path]::GetTempPath()) ('missing-neon-' + [Guid]::NewGuid().ToString('N')))

function Assert-NeonCondition($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$fixtureDirectory = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('nthawi-neon-runner-' + [Guid]::NewGuid().ToString('N'))))
$null = [IO.Directory]::CreateDirectory($fixtureDirectory)
$runtimePath = Join-Path $fixtureDirectory '.env.neon.test.runtime.local'
$operatorPath = Join-Path $fixtureDirectory '.env.neon.test.operator.local'
$entrypointDirectory = Join-Path $fixtureDirectory 'entrypoint'
$entrypointScripts = Join-Path $entrypointDirectory 'scripts'
$entrypointPath = Join-Path $entrypointScripts 'run-neon-database.ps1'
$hostName = 'ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech'
$expected = @{
    NEON_TARGET = 'test'; NEON_EXPECTED_BRANCH_ID = 'br-rapid-brook-zao6uwya'
    DATABASE_MIGRATOR_ROLE = 'nthawi_migrator'; DATABASE_AUTH_ROLE = 'nthawi_auth'
    DATABASE_BUSINESS_ROLE = 'nthawi_business'; DATABASE_JOBS_ROLE = 'nthawi_jobs'
}
foreach ($entry in @(
    @{ Kind = 'migrator'; Name = 'DATABASE_MIGRATION_URL' }
    @{ Kind = 'auth'; Name = 'AUTH_DATABASE_URL' }
    @{ Kind = 'business'; Name = 'DATABASE_URL' }
    @{ Kind = 'jobs'; Name = 'JOBS_DATABASE_URL' }
)) {
    $expected[$entry.Name] = 'postgresql://nthawi_{0}:synthetic%27quoted%40password%20%23%2F@{1}:5432/neondb?sslmode=verify-full' -f $entry.Kind, $hostName
}
$runtimeText = "# Synthetic credentials only`nexport AUTH_DATABASE_URL=`"$($expected.AUTH_DATABASE_URL)`" # quoted`nDATABASE_URL='$($expected.DATABASE_URL)'`n"
$operatorText = (@('DATABASE_MIGRATION_URL', 'JOBS_DATABASE_URL', 'DATABASE_MIGRATOR_ROLE', 'DATABASE_AUTH_ROLE', 'DATABASE_BUSINESS_ROLE', 'DATABASE_JOBS_ROLE', 'NEON_TARGET', 'NEON_EXPECTED_BRANCH_ID') | ForEach-Object { $_ + '=' + $expected[$_] }) -join "`n"
$encoding = [Text.UTF8Encoding]::new($false)
$sentinels = @('PGPASSWORD', 'PGSERVICEFILE', 'PGOPTIONS', 'PGHOSTADDR', 'DATABASE_LEGACY_URL', 'DATABASE_AUTH_PASSWORD', 'LEGACY_DATABASE_ROLE', 'DB_HOST', 'AUTH_TEST_ADMIN_URL', 'RLS_TEST_ADMIN_URL', 'NEON_OTHER', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED')
$original = @{}
foreach ($name in (@($expected.Keys) + $sentinels)) { $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    # Windows PowerShell evaluates -File parameter defaults before PSScriptRoot
    # is available. Exercise that real entrypoint in an empty synthetic root.
    $null = [IO.Directory]::CreateDirectory($entrypointScripts)
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-neon-database.ps1') -Destination $entrypointPath
    $entrypointResult = & {
        $ErrorActionPreference = 'Continue'
        $PSNativeCommandUseErrorActionPreference = $false
        $output = @(& (Get-Process -Id $PID).Path -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $entrypointPath -Target test -Mode check-config 2>&1)
        $exitCode = $LASTEXITCODE
        @{ Output = ($output | Out-String); ExitCode = $exitCode }
    }
    Assert-NeonCondition ($entrypointResult.ExitCode -ne 0 -and $entrypointResult.Output -match 'Missing Neon test configuration: .env.neon.test.runtime.local' -and $entrypointResult.Output -notmatch 'Join-Path|empty string|Node lookup') 'The -File entrypoint did not resolve its own configuration directory safely.'
    $global:LASTEXITCODE = 0

    [IO.File]::WriteAllText($runtimePath, $runtimeText, $encoding)
    [IO.File]::WriteAllText($operatorPath, $operatorText, $encoding)
    $actual = Read-NeonTestEnvironment -Directory $fixtureDirectory
    foreach ($name in $expected.Keys) { Assert-NeonCondition ($actual[$name] -ceq $expected[$name]) 'The dotenv reader changed a literal value.' }

    foreach ($invalid in @(
        @{ Runtime = $runtimeText + "DATABASE_URL=do-not-print-duplicate`n"; Operator = $operatorText }
        @{ Runtime = $runtimeText + "UNEXPECTED=do-not-print-extra`n"; Operator = $operatorText }
        @{ Runtime = "AUTH_DATABASE_URL='$($expected.AUTH_DATABASE_URL)'`n"; Operator = $operatorText }
        @{ Runtime = $runtimeText; Operator = $operatorText.Replace('NEON_TARGET=test', 'NEON_TARGET=production') }
        @{ Runtime = 'DATABASE_URL="unterminated-secret'; Operator = $operatorText }
    )) {
        [IO.File]::WriteAllText($runtimePath, $invalid.Runtime, $encoding)
        [IO.File]::WriteAllText($operatorPath, $invalid.Operator, $encoding)
        $failure = $null
        try { Read-NeonTestEnvironment -Directory $fixtureDirectory | Out-Null } catch { $failure = $_.Exception }
        Assert-NeonCondition ($null -ne $failure -and $failure.Message -notmatch 'do-not-print|unterminated-secret|postgresql://') 'Invalid dotenv input was accepted or disclosed.'
    }
    [IO.File]::WriteAllText($runtimePath, $runtimeText, $encoding)
    [IO.File]::WriteAllText($operatorPath, $operatorText, $encoding)

    # Exercise the real native boundary once, entirely offline, before mocking it.
    $script:NativeFailure = $null
    $nativeOutput = @(& {
        try {
            Invoke-NeonNative -File (Get-Process -Id $PID).Path -Arguments @('-NoProfile', '-NonInteractive', '-Command', "Write-Output 'do-not-print-native-secret'; [Console]::Error.WriteLine('code=NEON_ACCEPTANCE_FAILED stage=role:auth postgres_code=28P01 network_code=none'); [Console]::Error.WriteLine('do-not-print-native-stderr'); exit 7") -Stage 'Migration'
        } catch { $script:NativeFailure = $_.Exception }
    } 6>&1)
    $failure = $script:NativeFailure
    Assert-NeonCondition ($null -ne $failure -and $failure.Message -match 'Migration failed with exit code 7' -and (($nativeOutput | Out-String) + $failure.Message) -notmatch 'do-not-print-native-') 'Native failure handling was incorrect or disclosed raw output.'
    Assert-NeonCondition (($nativeOutput | Out-String) -match 'code=NEON_ACCEPTANCE_FAILED stage=role:auth postgres_code=28P01 network_code=none') 'Native failure handling discarded safe diagnostics.'
    $global:LASTEXITCODE = 0

    function Invoke-NeonNative {
        param([string]$File, [string[]]$Arguments, [string]$Stage)
        $script:Calls.Add(@{ Stage = $Stage; Arguments = $Arguments })
        foreach ($name in $expected.Keys) {
            Assert-NeonCondition ([Environment]::GetEnvironmentVariable($name, 'Process') -ceq $expected[$name]) 'A subprocess did not receive the exact selected environment.'
        }
        foreach ($name in $sentinels) {
            Assert-NeonCondition ($null -eq [Environment]::GetEnvironmentVariable($name, 'Process')) 'A subprocess inherited a conflicting environment setting.'
        }
        Assert-NeonCondition (@($Arguments | Where-Object { $_ -like '--env-file*' }).Count -eq 0) 'Runner delegated environment precedence to Node env-file flags.'
        if ($Stage -eq 'Node lookup') { return (Get-Process -Id $PID).Path }
        if ($Stage -eq 'Node version') { return $script:NodeVersion }
        if ($Stage -eq $script:FailStage) { throw 'Synthetic stage failure.' }
    }

    $cases = @(
        @{ Mode = 'check-config'; Fail = ''; Expected = @('Node lookup', 'Node version', 'Test target configuration') }
        @{ Mode = 'verify'; Fail = ''; Expected = @('Node lookup', 'Node version', 'Test target configuration', 'Schema check', 'Manifest check', 'Database build', 'Neon regression tests', 'Database acceptance', 'API build', 'API regression tests', 'Compiled API acceptance') }
        @{ Mode = 'migrate'; Fail = ''; Expected = @('Node lookup', 'Node version', 'Test target configuration', 'Schema check', 'Manifest check', 'Database build', 'Neon regression tests', 'Migration preflight', 'Migration', 'Runtime grants', 'Database acceptance', 'API build', 'API regression tests', 'Compiled API acceptance') }
        @{ Mode = 'migrate'; Fail = 'Migration'; Expected = @('Node lookup', 'Node version', 'Test target configuration', 'Schema check', 'Manifest check', 'Database build', 'Neon regression tests', 'Migration preflight', 'Migration') }
        @{ Mode = 'migrate'; Fail = 'Migration preflight'; Expected = @('Node lookup', 'Node version', 'Test target configuration', 'Schema check', 'Manifest check', 'Database build', 'Neon regression tests', 'Migration preflight') }
        @{ Mode = 'migrate'; Fail = 'Test target configuration'; Expected = @('Node lookup', 'Node version', 'Test target configuration') }
        @{ Mode = 'migrate'; Fail = 'Unsupported Node'; Version = 'v22.19.0'; Expected = @('Node lookup', 'Node version') }
        @{ Mode = 'verify'; Fail = 'Database acceptance'; Expected = @('Node lookup', 'Node version', 'Test target configuration', 'Schema check', 'Manifest check', 'Database build', 'Neon regression tests', 'Database acceptance') }
        @{ Mode = 'verify'; Fail = 'Compiled API acceptance'; Expected = @('Node lookup', 'Node version', 'Test target configuration', 'Schema check', 'Manifest check', 'Database build', 'Neon regression tests', 'Database acceptance', 'API build', 'API regression tests', 'Compiled API acceptance') }
    )
    foreach ($case in $cases) {
        $script:Calls = [Collections.Generic.List[object]]::new()
        $script:FailStage = $case.Fail
        $script:NodeVersion = if ($case.ContainsKey('Version')) { $case.Version } else { 'v24.21.0' }
        foreach ($name in $expected.Keys) { Set-NeonProcessEnvironment $name 'inherited-production-sentinel' }
        foreach ($name in $sentinels) { Set-NeonProcessEnvironment $name 'inherited-conflict-sentinel' }
        Set-NeonProcessEnvironment 'DATABASE_AUTH_PASSWORD' $null
        $previousDirectory = (Get-Location).Path
        $failure = $null
        try { Invoke-NeonDatabase -Mode $case.Mode -Target test -EnvironmentDirectory $fixtureDirectory | Out-Null }
        catch { $failure = $_.Exception }
        Assert-NeonCondition (($null -ne $failure) -eq ($case.Fail.Length -gt 0)) 'Unexpected lifecycle result.'
        Assert-NeonCondition ((@($script:Calls | ForEach-Object { $_.Stage }) -join '|') -ceq ($case.Expected -join '|')) 'Runner stages were not ordered or did not stop at failure.'
        foreach ($name in $expected.Keys) { Assert-NeonCondition ([Environment]::GetEnvironmentVariable($name, 'Process') -ceq 'inherited-production-sentinel') 'A selected variable was not restored.' }
        foreach ($name in @($sentinels | Where-Object { $_ -ne 'DATABASE_AUTH_PASSWORD' })) { Assert-NeonCondition ([Environment]::GetEnvironmentVariable($name, 'Process') -ceq 'inherited-conflict-sentinel') 'A conflicting variable was not restored.' }
        Assert-NeonCondition ($null -eq [Environment]::GetEnvironmentVariable('DATABASE_AUTH_PASSWORD', 'Process')) 'An absent secret was recreated.'
        Assert-NeonCondition ((Get-Location).Path -eq $previousDirectory) 'Runner did not restore its working directory.'
    }

    foreach ($target in @('production', 'TEST', '')) {
        $script:Calls.Clear()
        $failure = $null
        try { Invoke-NeonDatabase -Target $target -EnvironmentDirectory $fixtureDirectory | Out-Null } catch { $failure = $_.Exception }
        Assert-NeonCondition ($null -ne $failure -and $script:Calls.Count -eq 0) 'A non-test target reached a subprocess.'
    }
    $script:Calls.Clear()
    [IO.File]::WriteAllText($operatorPath, $operatorText.Replace('NEON_TARGET=test', 'NEON_TARGET=production'), $encoding)
    $failure = $null
    try { Invoke-NeonDatabase -Mode migrate -EnvironmentDirectory $fixtureDirectory | Out-Null } catch { $failure = $_.Exception }
    Assert-NeonCondition ($null -ne $failure -and $script:Calls.Count -eq 0 -and $env:DATABASE_URL -ceq 'inherited-production-sentinel') 'Production credentials were accepted or configuration failure lost the original environment.'
    Write-Host 'Neon runner regression checks passed (9 lifecycle cases, configuration rejection, environment isolation, and native failure handling).'
} finally {
    foreach ($name in $original.Keys) { Set-NeonProcessEnvironment $name $original[$name] }
    foreach ($path in @($runtimePath, $operatorPath, $entrypointPath)) {
        if (-not [IO.Path]::GetFullPath($path).StartsWith($fixtureDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup outside the synthetic fixture directory.' }
        if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path }
    }
    foreach ($directory in @($entrypointScripts, $entrypointDirectory)) {
        if ([IO.Directory]::Exists($directory)) { [IO.Directory]::Delete($directory, $false) }
    }
    [IO.Directory]::Delete($fixtureDirectory, $false)
    $global:LASTEXITCODE = 0
}
