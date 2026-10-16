#Requires -Version 5.1

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$neonDirectHost = 'ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech'

$runtimePath = Join-Path $repositoryRoot '.env.neon.runtime.local'
$operatorPath = Join-Path $repositoryRoot '.env.neon.operator.local'

foreach ($destination in @($runtimePath, $operatorPath)) {
    if (Test-Path -LiteralPath $destination) {
        throw 'A Neon environment file already exists. Review it instead of overwriting it.'
    }
}

function Read-NthawiConnection {
    param(
        [Parameter(Mandatory)]
        [string]$NeonRole
    )

    $secret = Read-Host "Password previously set for $NeonRole" -AsSecureString
    $pointer = [IntPtr]::Zero

    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

        if ([string]::IsNullOrEmpty($plainPassword)) {
            throw 'An empty database password is not allowed.'
        }

        $encodedPassword = [Uri]::EscapeDataString($plainPassword)

        return (
            'postgresql://{0}:{1}@{2}:5432/neondb?sslmode=verify-full' -f
            $NeonRole, $encodedPassword, $neonDirectHost
        )
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }

        $plainPassword = $null
        $encodedPassword = $null
        $secret.Dispose()
    }
}

$migrationUrl = Read-NthawiConnection -NeonRole 'nthawi_migrator'
$authUrl = Read-NthawiConnection -NeonRole 'nthawi_auth'
$businessUrl = Read-NthawiConnection -NeonRole 'nthawi_business'
$jobsUrl = Read-NthawiConnection -NeonRole 'nthawi_jobs'

$runtimeContent = @(
    "AUTH_DATABASE_URL=$authUrl"
    "DATABASE_URL=$businessUrl"
    ''
) -join "`n"

$operatorContent = @(
    "DATABASE_MIGRATION_URL=$migrationUrl"
    "JOBS_DATABASE_URL=$jobsUrl"
    'DATABASE_MIGRATOR_ROLE=nthawi_migrator'
    'DATABASE_AUTH_ROLE=nthawi_auth'
    'DATABASE_BUSINESS_ROLE=nthawi_business'
    'DATABASE_JOBS_ROLE=nthawi_jobs'
    ''
) -join "`n"

$files = @(
    @{ Path = $runtimePath; Content = $runtimeContent }
    @{ Path = $operatorPath; Content = $operatorContent }
)

$createdPaths = [Collections.Generic.List[string]]::new()
$encoding = [Text.UTF8Encoding]::new($false)

try {
    foreach ($file in $files) {
        $stream = [IO.File]::Open(
            $file.Path,
            [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None
        )
        $createdPaths.Add($file.Path)
        $writer = $null

        try {
            $writer = [IO.StreamWriter]::new($stream, $encoding)
            $writer.Write($file.Content)
        }
        finally {
            if ($null -ne $writer) {
                $writer.Dispose()
            }
            $stream.Dispose()
        }
    }
}
catch {
    foreach ($createdPath in $createdPaths) {
        Remove-Item -LiteralPath $createdPath -ErrorAction SilentlyContinue
    }
    throw 'Neon environment files could not be created.'
}
finally {
    $migrationUrl = $null
    $authUrl = $null
    $businessUrl = $null
    $jobsUrl = $null
    $runtimeContent = $null
    $operatorContent = $null
    $files = $null
}

Write-Output 'Created separate Neon runtime and operator files. Credentials were not printed.'