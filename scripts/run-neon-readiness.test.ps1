#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
# Dot-sourcing defines the functions without running a readiness operation.
. "$PSScriptRoot/run-neon-readiness.ps1"

function Assert-NeonCondition($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

# Every case below must fail before Node runs, so nothing connects to Neon.
function Get-NeonReadinessFailure([hashtable]$Options) {
    try {
        Invoke-NeonReadiness -Options $Options
        return 'UNEXPECTED SUCCESS'
    } catch {
        return $_.Exception.Message
    }
}

$fixtureDirectory = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('nthawi-readiness-' + [Guid]::NewGuid().ToString('N'))))
$emptyDirectory = Join-Path $fixtureDirectory 'empty'
$configDirectory = Join-Path $fixtureDirectory 'config'
$evidenceDirectory = Join-Path $fixtureDirectory 'evidence'
$pluginDirectory = Join-Path $fixtureDirectory '.anchor'
foreach ($path in @($emptyDirectory, $configDirectory, $evidenceDirectory, $pluginDirectory)) { $null = [IO.Directory]::CreateDirectory($path) }
$hostName = 'ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech'
$url = { param($role) "postgresql://${role}:synthetic-only@${hostName}:5432/neondb?sslmode=verify-full" }
$encoding = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $configDirectory '.env.neon.test.runtime.local'),
    ("AUTH_DATABASE_URL=" + (& $url 'nthawi_auth') + "`nDATABASE_URL=" + (& $url 'nthawi_business') + "`n"), $encoding)
[IO.File]::WriteAllText((Join-Path $configDirectory '.env.neon.test.operator.local'), ((@(
    ('DATABASE_MIGRATION_URL=' + (& $url 'nthawi_migrator'))
    ('JOBS_DATABASE_URL=' + (& $url 'nthawi_jobs'))
    'DATABASE_MIGRATOR_ROLE=nthawi_migrator', 'DATABASE_AUTH_ROLE=nthawi_auth'
    'DATABASE_BUSINESS_ROLE=nthawi_business', 'DATABASE_JOBS_ROLE=nthawi_jobs'
    'NEON_TARGET=test', 'NEON_EXPECTED_BRANCH_ID=br-rapid-brook-zao6uwya'
)) -join "`n"), $encoding)
# Two assignments: the strict export reader must refuse this file.
[IO.File]::WriteAllText((Join-Path $configDirectory '.env.neon.test.export.local'),
    ("NEON_ACCEPTANCE_ADMIN_URL=" + (& $url 'nthawi_export') + "`nNEON_EXTRA=1`n"), $encoding)

$sentinels = @{ NEON_ACCEPTANCE_ADMIN_URL = 'sentinel-admin'; PGPASSWORD = 'sentinel-pg'; DATABASE_URL = 'sentinel-db'; NODE_OPTIONS = $null; NEON_TARGET = $null }
# PowerShell 7 passes $null to a .NET string parameter as "", which .NET then
# stores as an empty variable. Absent values therefore go through Env: removal.
function Set-NeonTestVariable([string]$Name, $Value) {
    if ($null -eq $Value) { Remove-Item -LiteralPath ('Env:' + $Name) -ErrorAction SilentlyContinue }
    else { Set-Item -LiteralPath ('Env:' + $Name) -Value $Value }
}
function Test-NeonTestVariable([string]$Name, $Expected) {
    $actual = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ($null -eq $Expected) { return [string]::IsNullOrEmpty($actual) }
    return $actual -ceq $Expected
}
$original = @{}
foreach ($name in $sentinels.Keys) { $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    foreach ($name in $sentinels.Keys) { Set-NeonTestVariable $name $sentinels[$name] }
    $base = @{
        Mode = 'isolation'; AuthorizationId = 'owner-answer-2026-11-05'
        Confirmation = 'synthetic-isolation:delicate-feather-83629956:br-rapid-brook-zao6uwya'
        EnvironmentDirectory = $configDirectory; OutputDirectory = $evidenceDirectory
        PgDump = ''; PgRestore = ''; CertificateFile = ''; MinCu = 0.25; MaxCu = 1
    }
    $cases = @(
        @{ Name = 'operation confirmation for another mode'; Change = @{ Confirmation = 'synthetic-export:delicate-feather-83629956:br-rapid-brook-zao6uwya' }; Expect = 'Explicit registered-test operation confirmation required.' }
        @{ Name = 'production branch confirmation'; Change = @{ Confirmation = 'synthetic-isolation:delicate-feather-83629956:br-lively-darkness-zahxet6z' }; Expect = 'Explicit registered-test operation confirmation required.' }
        @{ Name = 'missing authorization reference'; Change = @{ AuthorizationId = '' }; Expect = 'An owner authorization reference is required.' }
        @{ Name = 'unsafe authorization reference'; Change = @{ AuthorizationId = "owner`nsecret" }; Expect = 'An owner authorization reference is required.' }
        @{ Name = 'relative evidence directory'; Change = @{ OutputDirectory = 'evidence' }; Expect = 'An existing absolute private evidence directory is required.' }
        @{ Name = 'plugin state evidence directory'; Change = @{ OutputDirectory = $pluginDirectory }; Expect = 'An existing absolute private evidence directory is required.' }
        @{ Name = 'export without PostgreSQL 18 tools'; Change = @{ Mode = 'export'; Confirmation = 'synthetic-export:delicate-feather-83629956:br-rapid-brook-zao6uwya' }; Expect = 'Export requires existing absolute PostgreSQL 18 pg_dump, pg_restore and CA bundle paths.' }
        @{ Name = 'inverted capacity range'; Change = @{ Mode = 'capacity'; Confirmation = 'capacity-read:delicate-feather-83629956:br-rapid-brook-zao6uwya'; MinCu = 2; MaxCu = 1 }; Expect = 'A valid autoscaling range is required (0.25 <= min <= max <= 16).' }
        @{ Name = 'missing private test configuration'; Change = @{ EnvironmentDirectory = $emptyDirectory }; Expect = 'Missing Neon test configuration: .env.neon.test.runtime.local' }
        @{ Name = 'invalid private export configuration'; Change = @{}; Expect = 'Invalid private export configuration.' }
    )
    foreach ($case in $cases) {
        $options = $base.Clone()
        foreach ($key in $case.Change.Keys) { $options[$key] = $case.Change[$key] }
        $message = Get-NeonReadinessFailure $options
        Assert-NeonCondition ($message -ceq $case.Expect) ("{0}: unexpected result '{1}'" -f $case.Name, $message)
        foreach ($name in $sentinels.Keys) {
            Assert-NeonCondition (Test-NeonTestVariable $name $sentinels[$name]) ("{0}: {1} was not restored" -f $case.Name, $name)
        }
        Assert-NeonCondition (Test-NeonTestVariable 'NEON_ACCEPTANCE_CONFIRMATION' $null) ("{0}: confirmation leaked" -f $case.Name)
    }
    Write-Output ("PASS: {0} readiness runner refusal and environment-restoration cases." -f $cases.Count)
} finally {
    foreach ($name in $original.Keys) { Set-NeonTestVariable $name $original[$name] }
    $resolvedFixtureDirectory = [IO.Path]::GetFullPath($fixtureDirectory)
    $resolvedTempDirectory = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedFixtureDirectory.StartsWith($resolvedTempDirectory, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedFixtureDirectory) -notmatch '^nthawi-readiness-[a-f0-9]{32}$') { throw 'Refusing cleanup outside the owned readiness fixture.' }
    Remove-Item -LiteralPath $resolvedFixtureDirectory -Recurse -Force
}
