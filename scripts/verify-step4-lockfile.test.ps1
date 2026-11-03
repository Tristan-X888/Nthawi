#Requires -Version 5.1

$ErrorActionPreference = 'Stop'

$verificationScript = Join-Path `
    $PSScriptRoot `
    'verify-step4.ps1'

if (-not (
    Test-Path -LiteralPath $verificationScript -PathType Leaf
)) {
    throw 'Verification script is missing.'
}

# Dot-source to load the helpers without running
# the complete Step 4 integration workflow.
. $verificationScript

$testFile = Join-Path `
    ([System.IO.Path]::GetTempPath()) `
    ('nthawi-lockfile-test-' + [Guid]::NewGuid().ToString('N'))

try {
    # --------------------------------------------------
    # Test 1: Unchanged contents must pass
    # --------------------------------------------------

    [System.IO.File]::WriteAllText(
        $testFile,
        'existing legitimate dependency changes'
    )

    $originalHash = (
        Get-FileHash `
            -LiteralPath $testFile `
            -Algorithm SHA256
    ).Hash

    Assert-Step4LockfileUnchanged `
        -LockfilePath $testFile `
        -ExpectedSha256 $originalHash

    Write-Host 'PASS: Unchanged lockfile accepted.' `
        -ForegroundColor Green

    # --------------------------------------------------
    # Test 2: Modification must be rejected
    # --------------------------------------------------

    [System.IO.File]::WriteAllText(
        $testFile,
        'unexpected installation modification'
    )

    $rejected = $false

    try {
        Assert-Step4LockfileUnchanged `
            -LockfilePath $testFile `
            -ExpectedSha256 $originalHash
    }
    catch {
        if (
            $_.Exception.Message -notmatch
            'FROZEN_LOCKFILE_CHANGED'
        ) {
            throw
        }

        $rejected = $true
    }

    if (-not $rejected) {
        throw 'FAIL: Modified lockfile was incorrectly accepted.'
    }

    Write-Host 'PASS: Modified lockfile rejected.' `
        -ForegroundColor Green

    # --------------------------------------------------
    # Test 3: Missing lockfile must be rejected
    # --------------------------------------------------

    Remove-Item -LiteralPath $testFile -Force

    $missingRejected = $false

    try {
        Assert-Step4LockfileUnchanged `
            -LockfilePath $testFile `
            -ExpectedSha256 $originalHash
    }
    catch {
        if (
            $_.Exception.Message -ne
            'FROZEN_LOCKFILE_MISSING'
        ) {
            throw
        }

        $missingRejected = $true
    }

    if (-not $missingRejected) {
        throw 'FAIL: Missing lockfile was incorrectly accepted.'
    }

    Write-Host 'PASS: Missing lockfile rejected.' `
        -ForegroundColor Green

    Write-Host "`nSTEP4_LOCKFILE_REGRESSION_PASSED" `
        -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $testFile) {
        Remove-Item `
            -LiteralPath $testFile `
            -Force `
            -ErrorAction SilentlyContinue
    }
}