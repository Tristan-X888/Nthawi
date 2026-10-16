#Requires -Version 5.1

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$Step4RepositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..')
)

$Step4PackageManager = if (
    [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
) {
    'pnpm.cmd'
}
else {
    'pnpm'
}

function Set-Step4ProcessEnvironment {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [AllowNull()]
        [AllowEmptyString()]
        [object]$Value
    )

    $variablePath = 'Env:' + $Name

    if ($null -eq $Value) {
        if (Test-Path -LiteralPath $variablePath) {
            Remove-Item `
                -LiteralPath $variablePath `
                -ErrorAction Stop
        }
    }
    else {
        Set-Item `
            -LiteralPath $variablePath `
            -Value $Value `
            -ErrorAction Stop
    }
}

function Invoke-Step4Native {
    param(
        [Parameter(Mandatory)]
        [string]$File,

        [string[]]$Arguments
    )

    # Prevent PowerShell 7 native-error promotion from
    # interfering with explicit exit-code handling.
    $PSNativeCommandUseErrorActionPreference = $false

    & $File @Arguments

    $nativeExitCode = $LASTEXITCODE

    if ($nativeExitCode -ne 0) {
        # Do not print native arguments: they may contain secrets.
        throw "$File failed with exit code $nativeExitCode"
    }
}

function Assert-Step4LockfileUnchanged {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LockfilePath,

        [Parameter(Mandatory)]
        [string]$ExpectedSha256
    )

    if (-not (
        Test-Path -LiteralPath $LockfilePath -PathType Leaf
    )) {
        throw 'FROZEN_LOCKFILE_MISSING'
    }

    $actualSha256 = (
        Get-FileHash `
            -LiteralPath $LockfilePath `
            -Algorithm SHA256
    ).Hash

    if ($actualSha256 -cne $ExpectedSha256) {
        throw @'
FROZEN_LOCKFILE_CHANGED

The frozen dependency installation changed pnpm-lock.yaml.

The installation must be reproducible and must not
alter the lockfile.

Inspect package manifests and dependency resolution.
Do not automatically reset the lockfile.
'@
    }
}

function Invoke-Step4Verification {
    $project = 'nthawi-step4-' + [Guid]::NewGuid().ToString('N')

    $environmentFile = $null
    $composeArguments = $null
    $databaseAttempted = $false

    $failures = [System.Collections.Generic.List[System.Exception]]::new()

    $environment = @{
        NEXT_PUBLIC_API_URL = 'https://app.example.test'

        RLS_TEST_ADMIN_URL = (
            'postgresql://testadmin:synthetic-test-password' +
            '@127.0.0.1:5434/nthawi_test'
        )

        AUTH_TEST_ADMIN_URL = (
            'postgresql://testadmin:synthetic-test-password' +
            '@127.0.0.1:5434/nthawi_test'
        )
    }

    $originalEnvironment = @{}

    foreach ($name in $environment.Keys) {
        $originalEnvironment[$name] = (
            [Environment]::GetEnvironmentVariable(
                $name,
                'Process'
            )
        )
    }

    Push-Location -LiteralPath $Step4RepositoryRoot

    try {
        # --------------------------------------------------
        # 1. Verify approved runtime versions
        # --------------------------------------------------

        $nodeVersion = (
            (
                Invoke-Step4Native `
                    $Step4PackageManager `
                    @('exec', 'node', '--version')
            ) | Out-String
        ).Trim()

        if ($nodeVersion -ne 'v24.21.0') {
            throw 'Step 4 requires managed Node v24.21.0.'
        }

        $pnpmVersion = (
            (
                Invoke-Step4Native `
                    $Step4PackageManager `
                    @('--version')
            ) | Out-String
        ).Trim()

        if ($pnpmVersion -ne '10.16.1') {
            throw 'Step 4 requires pnpm 10.16.1.'
        }

        # --------------------------------------------------
        # 2. Verify Docker availability
        # --------------------------------------------------

        Invoke-Step4Native `
            'docker' `
            @('compose', 'version')

        Invoke-Step4Native `
            'docker' `
            @('info', '--format', '{{.ServerVersion}}')

        # --------------------------------------------------
        # 3. Verify frozen dependency integrity
        # --------------------------------------------------

        $lockfilePath = Join-Path `
            $Step4RepositoryRoot `
            'pnpm-lock.yaml'

        if (-not (
            Test-Path -LiteralPath $lockfilePath -PathType Leaf
        )) {
            throw 'FROZEN_LOCKFILE_MISSING'
        }

        $lockfileHashBefore = (
            Get-FileHash `
                -LiteralPath $lockfilePath `
                -Algorithm SHA256
        ).Hash

        Write-Host "`n=== FROZEN DEPENDENCY VERIFICATION ===" `
            -ForegroundColor Cyan

        Invoke-Step4Native `
            $Step4PackageManager `
            @('install', '--frozen-lockfile')

        Assert-Step4LockfileUnchanged `
            -LockfilePath $lockfilePath `
            -ExpectedSha256 $lockfileHashBefore

        # Existing differences are allowed at this execution gate.
        # Whitespace errors in tracked lockfile changes are not.
        Invoke-Step4Native `
            'git' `
            @('diff', '--check', '--', 'pnpm-lock.yaml')

        Invoke-Step4Native `
            'git' `
            @('diff', '--cached', '--check', '--', 'pnpm-lock.yaml')

        Write-Host 'Frozen dependency integrity passed.' `
            -ForegroundColor Green

        # --------------------------------------------------
        # 4. Configure disposable test environment
        # --------------------------------------------------

        foreach ($name in $environment.Keys) {
            Set-Step4ProcessEnvironment `
                -Name $name `
                -Value $environment[$name]
        }

        # An empty environment file prevents Compose from
        # automatically reading the developer's .env.
        $environmentFile = [System.IO.Path]::GetTempFileName()

        $testComposeFile = Join-Path `
            $Step4RepositoryRoot `
            'infra/compose.test.yml'

        if (-not (
            Test-Path -LiteralPath $testComposeFile -PathType Leaf
        )) {
            throw 'STEP4_TEST_COMPOSE_FILE_MISSING'
        }

        $composeArguments = @(
            'compose',
            '--project-name',
            $project,
            '--env-file',
            $environmentFile,
            '--file',
            $testComposeFile
        )

        # --------------------------------------------------
        # 5. Start isolated PostgreSQL test environment
        # --------------------------------------------------

        Write-Host "`n=== ISOLATED TEST DATABASE ===" `
            -ForegroundColor Cyan

        # Mark attempted before the Docker invocation.
        # Failed Docker clients may leave scoped resources behind.
        $databaseAttempted = $true

        Invoke-Step4Native `
            'docker' `
            ($composeArguments + @(
                'up',
                '--detach',
                '--wait',
                '--wait-timeout',
                '90'
            ))

        # --------------------------------------------------
        # 6. Database schema and manifest checks
        # --------------------------------------------------

        Invoke-Step4Native `
            $Step4PackageManager `
            @(
                '--filter',
                '@nthawi/db',
                'db:check'
            )

        Invoke-Step4Native `
            $Step4PackageManager `
            @(
                '--filter',
                '@nthawi/db',
                'db:manifest:check'
            )

        # --------------------------------------------------
        # 7. Complete Step 4 checks
        # --------------------------------------------------

        Invoke-Step4Native `
            $Step4PackageManager `
            @('check:step4')

        # --------------------------------------------------
        # 8. Dependency vulnerability audit
        # --------------------------------------------------

        Invoke-Step4Native `
            $Step4PackageManager `
            @(
                'audit',
                '--prod',
                '--audit-level',
                'high'
            )

        # --------------------------------------------------
        # 9. Build production API container image
        # --------------------------------------------------

        Invoke-Step4Native `
            'docker' `
            @(
                'build',
                '--pull',
                '--file',
                'infra/docker/api.Dockerfile',
                '--tag',
                'nthawi-api:step4',
                '.'
            )

        # --------------------------------------------------
        # 10. Verify the built API image
        # --------------------------------------------------

        Invoke-Step4Native `
            $Step4PackageManager `
            @(
                'check:api-image',
                'nthawi-api:step4'
            )
    }
    catch {
        $failures.Add($_.Exception)
    }
    finally {
        # --------------------------------------------------
        # 11. Clean up only our disposable Compose project
        # --------------------------------------------------

        if ($databaseAttempted) {
            try {
                if (
                    $project -notmatch
                    '^nthawi-step4-[a-f0-9]{32}$'
                ) {
                    throw 'Refusing cleanup of an unowned Compose project.'
                }

                Invoke-Step4Native `
                    'docker' `
                    ($composeArguments + @(
                        'down',
                        '--volumes',
                        '--remove-orphans',
                        '--timeout',
                        '10'
                    ))
            }
            catch {
                $failures.Add($_.Exception)
            }
        }

        # --------------------------------------------------
        # 12. Remove temporary Compose environment file
        # --------------------------------------------------

        try {
            if ($null -ne $environmentFile) {
                Remove-Item `
                    -LiteralPath $environmentFile `
                    -Force `
                    -ErrorAction Stop
            }
        }
        catch {
            $failures.Add($_.Exception)
        }
        finally {
            # --------------------------------------------------
            # 13. Restore original process environment
            # --------------------------------------------------

            foreach ($name in $originalEnvironment.Keys) {
                Set-Step4ProcessEnvironment `
                    -Name $name `
                    -Value $originalEnvironment[$name]
            }

            Pop-Location
        }
    }

    # --------------------------------------------------
    # 14. Report all verification failures
    # --------------------------------------------------

    if ($failures.Count -gt 0) {
        throw [System.AggregateException]::new(
            'Step 4 verification failed.',
            [System.Exception[]]$failures.ToArray()
        )
    }

    Write-Host `
        'Step 4 dependency, integration, audit and image gates passed.' `
        -ForegroundColor Green
}

# Dot-sourcing exposes helpers to the regression harness.
# Normal execution runs the complete verification.
if ($MyInvocation.InvocationName -ne '.') {
    Invoke-Step4Verification
}