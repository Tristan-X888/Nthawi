$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/verify-step4.ps1"

function Assert-GateCondition($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$nativeFailure = $null
try {
    Invoke-Step4Native (Get-Process -Id $PID).Path @('-NoProfile', '-Command', 'exit 7')
} catch { $nativeFailure = $_.Exception }
Assert-GateCondition ($null -ne $nativeFailure -and $nativeFailure.Message -match 'exit code 7') 'Native exit failure was not detected'
# This exit was deliberately exercised and asserted. Native invocations update
# global state, which GitHub's enclosing pwsh shell reads after the script ends.
$global:LASTEXITCODE = 0

# Replace only the native command boundary; exercise the real lifecycle without
# starting Docker or running the complete repository gate from these unit tests.
function Invoke-Step4Native {
    param([string]$File, [string[]]$Arguments)
    $script:Calls.Add(@{ File = $File; Arguments = $Arguments })
    if (($Arguments -join ' ') -eq 'exec node --version') { return $script:NodeVersion }
    if ($File -eq $Step4PackageManager -and ($Arguments -join ' ') -eq '--version') { return '10.16.1' }
    if ($Arguments -contains 'up' -and $script:FailStartup) { throw 'database startup failed' }
    if ($Arguments -contains 'check:step4' -and $script:FailGate) { throw 'gate failed' }
    if ($Arguments -contains 'down' -and $script:FailCleanup) { throw 'cleanup failed' }
}

function Test-Lifecycle([bool]$FailGate, [bool]$FailCleanup, [string]$NodeVersion = 'v24.21.0', [bool]$FailStartup = $false) {
    $script:Calls = [System.Collections.Generic.List[object]]::new()
    $script:FailGate = $FailGate
    $script:FailCleanup = $FailCleanup
    $script:FailStartup = $FailStartup
    $script:NodeVersion = $NodeVersion
    $previousUrl = [Environment]::GetEnvironmentVariable('RLS_TEST_ADMIN_URL', 'Process')
    $previousAuthUrl = [Environment]::GetEnvironmentVariable('AUTH_TEST_ADMIN_URL', 'Process')
    $previousPublicUrl = [Environment]::GetEnvironmentVariable('NEXT_PUBLIC_API_URL', 'Process')
    $previousDirectory = (Get-Location).Path
    try {
        $env:RLS_TEST_ADMIN_URL = 'restore-original-test-sentinel'
        $env:AUTH_TEST_ADMIN_URL = 'restore-auth-test-sentinel'
        [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_API_URL', $null, 'Process')
        $failure = $null
        try { Invoke-Step4Verification } catch { $failure = $_.Exception }
        Assert-GateCondition ($env:RLS_TEST_ADMIN_URL -eq 'restore-original-test-sentinel') 'Administrator environment was not restored'
        Assert-GateCondition ($env:AUTH_TEST_ADMIN_URL -eq 'restore-auth-test-sentinel') 'Auth administrator environment was not restored'
        Assert-GateCondition ($null -eq [Environment]::GetEnvironmentVariable('NEXT_PUBLIC_API_URL', 'Process')) 'Absent environment variable was not restored'
        Assert-GateCondition ((Get-Location).Path -eq $previousDirectory) 'Working directory was not restored'
        $starts = @($script:Calls | Where-Object { $_.Arguments -contains 'up' })
        $cleanups = @($script:Calls | Where-Object { $_.Arguments -contains 'down' })
        if ($NodeVersion -ne 'v24.21.0') {
            Assert-GateCondition ($null -ne $failure) 'An unsupported toolchain passed'
            Assert-GateCondition ($starts.Count -eq 0 -and $cleanups.Count -eq 0) 'Version rejection started or removed database resources'
        } else {
            Assert-GateCondition ($starts.Count -eq 1 -and $cleanups.Count -eq 1) 'Database lifecycle did not finish exactly once'
            $startArgs = $starts[0].Arguments
            $cleanupArgs = $cleanups[0].Arguments
            Assert-GateCondition ($startArgs[2] -match '^nthawi-step4-[a-f0-9]{32}$') 'Database project was not isolated'
            Assert-GateCondition ($startArgs[2] -eq $cleanupArgs[2]) 'Cleanup targeted a different project'
            Assert-GateCondition (-not (Test-Path -LiteralPath $startArgs[4])) 'Synthetic environment file was not removed'
            Assert-GateCondition (($null -ne $failure) -eq ($FailGate -or $FailCleanup -or $FailStartup)) 'A failed gate or cleanup was reported as success'
            if ($FailGate -and $FailCleanup) {
                Assert-GateCondition ($failure.InnerExceptions.Count -eq 2) 'Cleanup concealed the original gate failure'
            }
            if ($FailGate) {
                Assert-GateCondition (@($script:Calls | Where-Object { $_.Arguments -contains 'audit' }).Count -eq 0) 'Verification continued after a failed native gate'
            }
            if ($FailStartup) {
                Assert-GateCondition (@($script:Calls | Where-Object { $_.Arguments -contains 'check:step4' }).Count -eq 0) 'Verification continued after database startup failed'
            }
        }
    } finally {
        [Environment]::SetEnvironmentVariable('RLS_TEST_ADMIN_URL', $previousUrl, 'Process')
        [Environment]::SetEnvironmentVariable('AUTH_TEST_ADMIN_URL', $previousAuthUrl, 'Process')
        [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_API_URL', $previousPublicUrl, 'Process')
    }
}

Test-Lifecycle $false $false
Test-Lifecycle $true $false
Test-Lifecycle $false $true
Test-Lifecycle $true $true
Test-Lifecycle $false $false 'v22.19.0'
Test-Lifecycle $false $false 'v24.21.0' $true
# GitHub's pwsh shell appends this native-state check after the script returns.
# A deliberately caught failure must not make a successful harness fail CI.
if (Test-Path variable:LASTEXITCODE) {
    Assert-GateCondition ($LASTEXITCODE -eq 0) 'GitHub PowerShell exit trailer would report a failed harness'
}
Write-Host 'Step 4 lifecycle tests passed (6 cases plus native exit regression).'
