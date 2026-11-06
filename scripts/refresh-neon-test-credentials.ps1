#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('test')][string]$Target,
      [Parameter(Mandatory)][string]$ConfirmBranch)
$ErrorActionPreference = 'Stop'
if ($ConfirmBranch -cne 'br-rapid-brook-zao6uwya') { throw 'The registered test branch must be explicitly confirmed.' }
$credentialRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$credentialFiles = @('.env.neon.test.runtime.local', '.env.neon.test.operator.local', '.env.neon.test.export.local')
foreach ($credentialFile in $credentialFiles) {
    if (Test-Path -LiteralPath (Join-Path $credentialRoot $credentialFile)) { throw 'Private test configuration already exists; inspect it privately instead of overwriting it.' }
}
$credentialRoles = @{
    DATABASE_MIGRATION_URL = 'nthawi_migrator'
    AUTH_DATABASE_URL = 'nthawi_auth'
    DATABASE_URL = 'nthawi_business'
    JOBS_DATABASE_URL = 'nthawi_jobs'
    NEON_ACCEPTANCE_ADMIN_URL = 'nthawi_export'
}
$credentialValues = @{}
$credentialCreated = [Collections.Generic.List[string]]::new()
try {
    foreach ($credentialKey in $credentialRoles.Keys) {
        # Credential output and native diagnostics stay in memory, never logs.
        $credentialOutput = @(& neon connection-string br-rapid-brook-zao6uwya --project-id delicate-feather-83629956 --database-name neondb --role-name $credentialRoles[$credentialKey] --ssl verify-full --no-color 2>&1)
        if ($LASTEXITCODE -ne 0) { throw 'Credential lookup failed.' }
        $credentialLines = @($credentialOutput | ForEach-Object { [regex]::Replace($_.ToString(), '\x1B\[[0-?]*[ -/]*[@-~]', '') } | Where-Object { $_ -match '^postgres(?:ql)?://' })
        if ($credentialLines.Count -ne 1) { throw 'Unexpected credential response.' }
        $credentialUri = [Uri]::new($credentialLines[0])
        $credentialUserInfo = $credentialUri.UserInfo -split ':', 2
        if ($credentialUri.Host -cne 'ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech' -or
            $credentialUri.AbsolutePath -cne '/neondb' -or
            $credentialUri.Port -notin @(-1, 5432) -or
            $credentialUri.Scheme -notin @('postgres', 'postgresql') -or
            $credentialUserInfo.Count -ne 2 -or
            $credentialUserInfo[0] -cne $credentialRoles[$credentialKey] -or
            [string]::IsNullOrEmpty($credentialUserInfo[1]) -or $credentialUri.Fragment) { throw 'Credential target mismatch.' }
        if ([Uri]::UnescapeDataString($credentialUserInfo[1]).Contains([char]0)) { throw 'Invalid credential encoding.' }
        $credentialOptions = @($credentialUri.Query.TrimStart('?') -split '&')
        if (@($credentialOptions | Where-Object { $_ -ceq 'sslmode=verify-full' }).Count -ne 1 -or
            @($credentialOptions | Where-Object { $_ -ceq 'channel_binding=require' }).Count -gt 1) { throw 'Duplicate TLS options are refused.' }
        foreach ($credentialOption in $credentialOptions) {
            if ($credentialOption -cnotin @('sslmode=verify-full', 'channel_binding=require')) { throw 'Unexpected connection override.' }
        }
        if ($credentialUri.Query -notmatch '(?:^\?|&)sslmode=verify-full(?:&|$)') { throw 'Verified TLS is required.' }
        $credentialValues[$credentialKey] = 'postgresql://' + $credentialUri.UserInfo + '@ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech:5432/neondb?sslmode=verify-full'
    }
    $credentialContent = @{
        '.env.neon.test.runtime.local' = @("AUTH_DATABASE_URL=$($credentialValues.AUTH_DATABASE_URL)", "DATABASE_URL=$($credentialValues.DATABASE_URL)")
        '.env.neon.test.operator.local' = @("DATABASE_MIGRATION_URL=$($credentialValues.DATABASE_MIGRATION_URL)", "JOBS_DATABASE_URL=$($credentialValues.JOBS_DATABASE_URL)", 'DATABASE_MIGRATOR_ROLE=nthawi_migrator', 'DATABASE_AUTH_ROLE=nthawi_auth', 'DATABASE_BUSINESS_ROLE=nthawi_business', 'DATABASE_JOBS_ROLE=nthawi_jobs', 'NEON_TARGET=test', 'NEON_EXPECTED_BRANCH_ID=br-rapid-brook-zao6uwya')
        '.env.neon.test.export.local' = @("NEON_ACCEPTANCE_ADMIN_URL=$($credentialValues.NEON_ACCEPTANCE_ADMIN_URL)")
    }
    foreach ($credentialFile in $credentialFiles) {
        $credentialPath = Join-Path $credentialRoot $credentialFile
        $credentialStream = [IO.File]::Open($credentialPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $credentialCreated.Add($credentialPath)
        try {
            $credentialBytes = [Text.UTF8Encoding]::new($false).GetBytes(($credentialContent[$credentialFile] -join "`n") + "`n")
            $credentialStream.Write($credentialBytes, 0, $credentialBytes.Length)
            $credentialStream.Flush($true)
        } finally { $credentialStream.Dispose() }
    }
    Write-Output 'NEON_TEST_CREDENTIALS_WRITTEN existing_passwords_preserved=true'
} catch {
    # Remove only files created by this invocation, never preexisting config.
    foreach ($credentialPath in $credentialCreated) { Remove-Item -LiteralPath $credentialPath -ErrorAction SilentlyContinue }
    throw 'Private test credential refresh failed; no existing role or password was changed. Diagnostic details were suppressed.'
} finally {
    $credentialOutput = $null; $credentialLines = $null; $credentialUri = $null
    $credentialUserInfo = $null; $credentialValues = $null; $credentialContent = $null; $credentialBytes = $null
}
