#Requires -Version 5.1

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot

$projectId = 'delicate-feather-83629956'
$branchId = 'br-rapid-brook-zao6uwya'
$branchName = 'test/nthawi-database-bootstrap'

$testHost = 'ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech'

$productionHost = 'ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech'

$psqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'

$certificateFile = Join-Path `
    $env:LOCALAPPDATA `
    'Nthawi\certs\mozilla-ca-bundle.pem'

$secretNames = @(
    'DATABASE_MIGRATOR_PASSWORD',
    'DATABASE_AUTH_PASSWORD',
    'DATABASE_BUSINESS_PASSWORD',
    'DATABASE_JOBS_PASSWORD'
)

$originalValues = @{}
$environmentCaptured = $false

Push-Location -LiteralPath $repositoryRoot

try {
    Write-Host "`n=== NTHAWI NEON TEST BOOTSTRAP ===" `
        -ForegroundColor Cyan

    # --------------------------------------------------
    # 1. Verify local prerequisites
    # --------------------------------------------------

    if (-not (
        Test-Path -LiteralPath $psqlPath -PathType Leaf
    )) {
        throw 'PostgreSQL 18 client was not found.'
    }

    if (-not (
        Test-Path -LiteralPath $certificateFile -PathType Leaf
    )) {
        throw 'Trusted CA certificate bundle was not found.'
    }

    $bootstrapFile = (
        Resolve-Path -LiteralPath 'infra/neon/bootstrap.psql'
    ).Path

    # --------------------------------------------------
    # 2. Verify exact target identity
    # --------------------------------------------------

    if ($testHost -ceq $productionHost) {
        throw 'Production endpoint detected.'
    }

    if ($testHost -match '-pooler\.') {
        throw 'Pooled PostgreSQL endpoint is prohibited.'
    }

    if (
        $testHost -cne
        'ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech'
    ) {
        throw 'Unexpected test database hostname.'
    }

    # --------------------------------------------------
    # 3. Verify bootstrap password-loading contract
    # --------------------------------------------------

    $bootstrapContent = [System.IO.File]::ReadAllText(
        $bootstrapFile
    )

    foreach ($secretName in $secretNames) {
        $pattern = (
            '(?m)^\s*\\getenv\s+\S+\s+' +
            [regex]::Escape($secretName) +
            '\s*$'
        )

        if (-not [regex]::IsMatch(
            $bootstrapContent,
            $pattern
        )) {
            throw (
                "Bootstrap does not contain the expected " +
                "psql environment-loading directive for " +
                $secretName +
                ". Inspect bootstrap.psql before continuing."
            )
        }
    }

    Write-Host "Bootstrap environment-loading directives found." `
        -ForegroundColor Green

    # --------------------------------------------------
    # 4. Display nonsecret target details
    # --------------------------------------------------

    Write-Host "`nProject: $projectId"
    Write-Host "Branch: $branchName"
    Write-Host "Branch ID: $branchId"
    Write-Host "Host: $testHost"
    Write-Host "Database: neondb"
    Write-Host "Port: 5432"
    Write-Host "TLS: verify-full"

    # --------------------------------------------------
    # 5. Require explicit test-branch authorization
    # --------------------------------------------------

    $approval = Read-Host `
        'Enter the exact TEST branch ID to continue'

    if ($approval.Trim() -cne $branchId) {
        throw 'Operator approval mismatch. No SQL executed.'
    }

    # --------------------------------------------------
    # 6. Preserve existing process environment
    # --------------------------------------------------

    $managedVariables = @(
        $secretNames +
        @(
            'PGSSLMODE',
            'PGSSLROOTCERT',
            'PGCONNECT_TIMEOUT'
        )
    )

    # libpq service files, hostaddr and options can override environment defaults
    # even when --host is supplied. Isolate the initial admin connection too.
    foreach ($name in [Environment]::GetEnvironmentVariables('Process').Keys) {
        if ($name -match '^PG') { $managedVariables += [string]$name }
    }
    $managedVariables = @($managedVariables | Select-Object -Unique)

    foreach ($name in $managedVariables) {
        $originalValues[$name] = `
            [Environment]::GetEnvironmentVariable(
                $name,
                'Process'
            )
    }

    $environmentCaptured = $true
    foreach ($name in $managedVariables) {
        if ($name -match '^PG') {
            [Environment]::SetEnvironmentVariable($name, $null, 'Process')
        }
    }

    # --------------------------------------------------
    # 7. Read role passwords without displaying them
    # --------------------------------------------------

    foreach ($name in $secretNames) {
        Write-Host "`nEnter the existing password for $name" `
            -ForegroundColor Yellow

        $secureValue = Read-Host `
            'Password (hidden)' `
            -AsSecureString

        $pointer = [IntPtr]::Zero

        try {
            if ($secureValue.Length -lt 24) {
                throw (
                    "$name must use a strong password " +
                    "of at least 24 characters."
                )
            }

            $pointer = `
                [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
                    $secureValue
                )

            $plainValue = `
                [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
                    $pointer
                )

            try {
                [Environment]::SetEnvironmentVariable(
                    $name,
                    $plainValue,
                    'Process'
                )
            }
            finally {
                Remove-Variable `
                    -Name plainValue `
                    -ErrorAction SilentlyContinue
            }
        }
        finally {
            if ($pointer -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
                    $pointer
                )
            }

            $secureValue.Dispose()
        }
    }

    # --------------------------------------------------
    # 8. Configure verified TLS
    # --------------------------------------------------

    $env:PGSSLMODE = 'verify-full'
    $env:PGSSLROOTCERT = $certificateFile
    $env:PGCONNECT_TIMEOUT = '15'
    $escapedCertificateFile = $certificateFile.Replace('\', '\\').Replace("'", "\'")
    $connectionOptions = (
        "host=$testHost port=5432 dbname=neondb user=neondb_owner " +
        "sslmode=verify-full sslrootcert='$escapedCertificateFile' connect_timeout=15"
    )

    # --------------------------------------------------
    # 9. Execute reviewed SQL
    # --------------------------------------------------

    Write-Host "`nExecuting reviewed test bootstrap..." `
        -ForegroundColor Cyan

    & $psqlPath `
        -X `
        -W `
        --dbname $connectionOptions `
        --set ON_ERROR_STOP=1 `
        --file $bootstrapFile

    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw (
            "Test bootstrap failed with exit code $exitCode. " +
            "Inspect the SQL error and transaction state. " +
            "Do not continue to production."
        )
    }

    Write-Host "`nNTHAWI TEST BOOTSTRAP COMPLETED." `
        -ForegroundColor Green
}
finally {
    # --------------------------------------------------
    # 10. Remove temporary secrets and restore environment
    # --------------------------------------------------

    if ($environmentCaptured) {
        foreach ($name in $managedVariables) {
            [Environment]::SetEnvironmentVariable(
                $name,
                $originalValues[$name],
                'Process'
            )
        }
    }

    Pop-Location
}
