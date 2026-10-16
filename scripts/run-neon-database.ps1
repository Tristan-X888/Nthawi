#Requires -Version 5.1

param(
    [ValidateSet('verify', 'migrate')]
    [string]$Mode = 'verify'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot

function Invoke-NthawiNative {
    param(
        [Parameter(Mandatory)]
        [scriptblock]$Command
    )

    & $Command

    if ($LASTEXITCODE -ne 0) {
        throw "Native command failed with exit code $LASTEXITCODE."
    }
}

Push-Location -LiteralPath $repositoryRoot

try {
    $runtimePath = (
        Resolve-Path -LiteralPath '.env.neon.runtime.local'
    ).Path

    $operatorPath = (
        Resolve-Path -LiteralPath '.env.neon.operator.local'
    ).Path

    $nodeLines = @(pnpm.cmd exec node -p 'process.execPath')

    if ($LASTEXITCODE -ne 0 -or $nodeLines.Count -eq 0) {
        throw 'Cannot locate the managed Node executable.'
    }

    $projectNode = ([string]($nodeLines | Select-Object -Last 1)).Trim()

    if (-not (Test-Path -LiteralPath $projectNode -PathType Leaf)) {
        throw 'Managed Node executable does not exist.'
    }

    $nodeVersion = & $projectNode --version

    if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne 'v24.21.0') {
        throw 'The reviewed Node 24.21.0 runtime is required.'
    }

    Invoke-NthawiNative {
        pnpm.cmd --filter @nthawi/db db:check
    }

    Invoke-NthawiNative {
        pnpm.cmd --filter @nthawi/db db:manifest:check
    }

    Invoke-NthawiNative {
        pnpm.cmd --filter @nthawi/db build
    }

    Invoke-NthawiNative {
        & $projectNode --test 'scripts/verify-neon-database.test.mjs'
    }

    if ($Mode -eq 'migrate') {
        Invoke-NthawiNative {
            & $projectNode `
                "--env-file=$runtimePath" `
                "--env-file=$operatorPath" `
                'scripts/verify-neon-database.mjs' `
                '--before-migrate'
        }

        Invoke-NthawiNative {
            & $projectNode `
                "--env-file=$operatorPath" `
                'packages/db/scripts/migrate.mjs'
        }

        Invoke-NthawiNative {
            & $projectNode `
                "--env-file=$operatorPath" `
                'packages/db/scripts/provision-runtime.mjs'
        }
    }

    Invoke-NthawiNative {
        & $projectNode `
            "--env-file=$runtimePath" `
            "--env-file=$operatorPath" `
            'scripts/verify-neon-database.mjs' `
            '--after-migrate'
    }

    Write-Output 'Neon database gate passed.'
}
finally {
    Pop-Location
}