[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Step4RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Step4PackageManager = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { 'pnpm.cmd' } else { 'pnpm' }

function Invoke-Step4Native {
    param([Parameter(Mandatory)][string]$File, [string[]]$Arguments)
    # PowerShell 7 CI shells may enable native-error promotion. Handle exit
    # codes here consistently with Windows PowerShell 5; this is function-local.
    $PSNativeCommandUseErrorActionPreference = $false
    & $File @Arguments
    $nativeExitCode = $LASTEXITCODE
    if ($nativeExitCode -ne 0) {
        # Arguments and command output can contain configuration values.
        throw "$File failed with exit code $nativeExitCode"
    }
}

function Invoke-Step4Verification {
    $project = 'nthawi-step4-' + [Guid]::NewGuid().ToString('N')
    $environmentFile = $null
    $databaseAttempted = $false
    $failures = [System.Collections.Generic.List[System.Exception]]::new()
    $environment = @{
        NEXT_PUBLIC_API_URL = 'https://app.example.test'
        RLS_TEST_ADMIN_URL = 'postgresql://testadmin:synthetic-test-password@127.0.0.1:5434/nthawi_test'
        AUTH_TEST_ADMIN_URL = 'postgresql://testadmin:synthetic-test-password@127.0.0.1:5434/nthawi_test'
    }
    $originalEnvironment = @{}
    foreach ($name in $environment.Keys) {
        $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    Push-Location -LiteralPath $Step4RepositoryRoot
    try {
        $nodeVersion = ((Invoke-Step4Native $Step4PackageManager @('exec', 'node', '--version')) | Out-String).Trim()
        if ($nodeVersion -ne 'v24.21.0') { throw 'Step 4 requires managed Node v24.21.0 (pnpm exec node).' }
        $pnpmVersion = ((Invoke-Step4Native $Step4PackageManager @('--version')) | Out-String).Trim()
        if ($pnpmVersion -ne '10.16.1') { throw 'Step 4 requires pnpm 10.16.1.' }
        Invoke-Step4Native 'docker' @('compose', 'version')
        Invoke-Step4Native 'docker' @('info', '--format', '{{.ServerVersion}}')
        Invoke-Step4Native $Step4PackageManager @('install', '--frozen-lockfile')
        Invoke-Step4Native 'git' @('diff', '--exit-code', '--', 'pnpm-lock.yaml')

        foreach ($name in $environment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $environment[$name], 'Process')
        }
        # Explicit empty env-file prevents Compose from reading the developer's .env.
        $environmentFile = [System.IO.Path]::GetTempFileName()
        $composeArguments = @('compose', '--project-name', $project, '--env-file', $environmentFile, '--file', (Join-Path $Step4RepositoryRoot 'infra/compose.test.yml'))
        # Mark attempted before invocation: a failed/timed-out Docker client can
        # leave its containers behind and still requires scoped cleanup.
        $databaseAttempted = $true
        Invoke-Step4Native 'docker' ($composeArguments + @('up', '--detach', '--wait', '--wait-timeout', '90'))
        Invoke-Step4Native $Step4PackageManager @('--filter', '@nthawi/db', 'db:check')
        Invoke-Step4Native $Step4PackageManager @('--filter', '@nthawi/db', 'db:manifest:check')
        Invoke-Step4Native $Step4PackageManager @('check:step4')
        Invoke-Step4Native $Step4PackageManager @('audit', '--prod', '--audit-level', 'high')
        Invoke-Step4Native 'docker' @('build', '--pull', '--file', 'infra/docker/api.Dockerfile', '--tag', 'nthawi-api:step4', '.')
        Invoke-Step4Native $Step4PackageManager @('check:api-image', 'nthawi-api:step4')
    } catch {
        $failures.Add($_.Exception)
    } finally {
        if ($databaseAttempted) {
            try {
                if ($project -notmatch '^nthawi-step4-[a-f0-9]{32}$') { throw 'Refusing cleanup of an unowned Compose project.' }
                Invoke-Step4Native 'docker' ($composeArguments + @('down', '--volumes', '--remove-orphans', '--timeout', '10'))
            } catch {
                $failures.Add($_.Exception)
            }
        }
        try {
            if ($null -ne $environmentFile) {
                Remove-Item -LiteralPath $environmentFile -Force -ErrorAction Stop
            }
        } catch {
            $failures.Add($_.Exception)
        } finally {
            foreach ($name in $originalEnvironment.Keys) {
                [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
            }
            Pop-Location
        }
    }
    if ($failures.Count -gt 0) {
        throw [System.AggregateException]::new('Step 4 verification failed.', [System.Exception[]]$failures.ToArray())
    }
    Write-Host 'Step 4 repository, integration, audit and image gates passed.'
}

# Dot-sourcing only exposes helpers to the local regression harness.
if ($MyInvocation.InvocationName -ne '.') { Invoke-Step4Verification }
