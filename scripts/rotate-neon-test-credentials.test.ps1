#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
# Dot-sourcing defines the functions without rotating anything.
. "$PSScriptRoot/rotate-neon-test-credentials.ps1"

function Assert-NeonCondition($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

# Every case must fail before the Neon CLI or Node runs, so nothing connects.
function Get-NeonRotationFailure([hashtable]$Options) {
    try {
        Invoke-NeonCredentialRotation -Options $Options
        return 'UNEXPECTED SUCCESS'
    } catch {
        return $_.Exception.Message
    }
}

$fixtureDirectory = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('nthawi-rotation-' + [Guid]::NewGuid().ToString('N'))))
$partialDirectory = Join-Path $fixtureDirectory 'partial'
$null = [IO.Directory]::CreateDirectory($partialDirectory)
[IO.File]::WriteAllText((Join-Path $partialDirectory '.env.neon.test.runtime.local'), "AUTH_DATABASE_URL=synthetic`n", [Text.UTF8Encoding]::new($false))
$sentinels = @{ NEON_ROTATION_OWNER_URL = 'sentinel-owner'; PGPASSWORD = 'sentinel-pg'; NEON_TARGET = 'sentinel-target' }
$original = @{}
foreach ($name in $sentinels.Keys) { $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    foreach ($name in $sentinels.Keys) { Set-Item -LiteralPath ('Env:' + $name) -Value $sentinels[$name] }
    $valid = 'rotate-role-passwords:delicate-feather-83629956:br-rapid-brook-zao6uwya'
    $cases = @(
        @{ Name = 'missing confirmation'; Options = @{ Confirmation = ''; EnvironmentDirectory = $partialDirectory }; Expect = 'Explicit registered-test rotation confirmation required.' }
        @{ Name = 'production branch confirmation'; Options = @{ Confirmation = 'rotate-role-passwords:delicate-feather-83629956:br-lively-darkness-zahxet6z'; EnvironmentDirectory = $partialDirectory }; Expect = 'Explicit registered-test rotation confirmation required.' }
        @{ Name = 'another operation confirmation'; Options = @{ Confirmation = 'synthetic-export:delicate-feather-83629956:br-rapid-brook-zao6uwya'; EnvironmentDirectory = $partialDirectory }; Expect = 'Explicit registered-test rotation confirmation required.' }
        @{ Name = 'missing configuration directory'; Options = @{ Confirmation = $valid; EnvironmentDirectory = (Join-Path $fixtureDirectory 'absent') }; Expect = 'The private Neon test configuration directory is missing.' }
        @{ Name = 'incomplete private configuration'; Options = @{ Confirmation = $valid; EnvironmentDirectory = $partialDirectory }; Expect = 'Missing private Neon test configuration: .env.neon.test.operator.local' }
    )
    foreach ($case in $cases) {
        $message = Get-NeonRotationFailure $case.Options
        Assert-NeonCondition ($message -ceq $case.Expect) ("{0}: unexpected result '{1}'" -f $case.Name, $message)
        foreach ($name in $sentinels.Keys) {
            Assert-NeonCondition ([Environment]::GetEnvironmentVariable($name, 'Process') -ceq $sentinels[$name]) ("{0}: {1} was not preserved" -f $case.Name, $name)
        }
    }
    Write-Output ("PASS: {0} credential rotation refusal cases." -f $cases.Count)
} finally {
    foreach ($name in $original.Keys) {
        if ($null -eq $original[$name]) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue }
        else { Set-Item -LiteralPath ('Env:' + $name) -Value $original[$name] }
    }
    $resolved = [IO.Path]::GetFullPath($fixtureDirectory)
    $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolved) -notmatch '^nthawi-rotation-[a-f0-9]{32}$') { throw 'Refusing cleanup outside the owned rotation fixture.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
