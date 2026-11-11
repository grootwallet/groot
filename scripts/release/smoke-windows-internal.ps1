[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $PackageDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'The Windows installer smoke test requires a disposable GitHub-hosted runner.'
}

$expectedCommit = $env:GROOT_INTERNAL_CANDIDATE_COMMIT
if ($expectedCommit -cnotmatch '^[a-f0-9]{40}$') {
    throw 'A full approved commit is required for the Windows smoke test.'
}
$packages = (Resolve-Path -LiteralPath $PackageDirectory).Path
$buildInfo = Get-Content -LiteralPath (Join-Path $packages 'BUILD-INFO') -Raw |
    ConvertFrom-StringData
if ($buildInfo['commit'] -cne $expectedCommit -or
    $buildInfo['candidate_commit'] -cne $expectedCommit -or
    $buildInfo['compiled_network'] -cne 'testnet4' -or
    $buildInfo['platform'] -cne 'windows-x86_64' -or
    $buildInfo['approval_context'] -cne 'protected-github-environment') {
    throw 'BUILD-INFO does not identify the approved Windows Testnet4 candidate.'
}

$installers = @(Get-ChildItem -LiteralPath $packages -File -Filter '*.msi')
if ($installers.Count -ne 1) {
    throw 'Expected exactly one MSI for the Windows smoke test.'
}
$installer = $installers[0]
$installerDigest = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$checksums = Get-Content -LiteralPath (Join-Path $packages 'SHA256SUMS')
if ($checksums -cnotcontains "$installerDigest  $($installer.Name)") {
    throw 'The MSI checksum did not match the build output.'
}

$installRoot = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Groot 0.5.4 Testnet4'
$bundleId = 'app.groot.wallet.testnet4.internal54'
$dataRoot = Join-Path ([Environment]::GetFolderPath('ApplicationData')) $bundleId
$localDataRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $bundleId
foreach ($path in @($installRoot, $dataRoot, $localDataRoot)) {
    if (Test-Path -LiteralPath $path) {
        throw 'The runner already contains a Groot Testnet4 installation or app data.'
    }
}

$msiexec = Join-Path ([Environment]::SystemDirectory) 'msiexec.exe'
function Invoke-GrootMsi([string[]] $Arguments) {
    $process = Start-Process -FilePath $msiexec -ArgumentList $Arguments -PassThru
    try {
        if (-not $process.WaitForExit(180000)) {
            if (-not $process.HasExited) { $process.Kill() }
            throw 'The Windows installer timed out.'
        }
        if ($process.ExitCode -ne 0) {
            throw "The Windows installer exited with code $($process.ExitCode)."
        }
    } finally {
        $process.Dispose()
    }
}

$installerPath = '"{0}"' -f $installer.FullName
$payloadRoot = [IO.Directory]::CreateTempSubdirectory('groot-msi-payload-').FullName
try {
    # Extract the verified MSI payload. The bundler can change the raw build executable.
    Invoke-GrootMsi @('/a', $installerPath, ('TARGETDIR="{0}"' -f $payloadRoot), '/qn', '/norestart')
    $payloadBinaries = @(Get-ChildItem -LiteralPath $payloadRoot -File -Recurse -Filter 'Groot.exe')
    if ($payloadBinaries.Count -ne 1) {
        throw 'The verified MSI must contain exactly one Groot executable.'
    }
    $payloadDigest = (Get-FileHash -LiteralPath $payloadBinaries[0].FullName -Algorithm SHA256).Hash
} finally {
    Remove-Item -LiteralPath $payloadRoot -Recurse -Force
}

Invoke-GrootMsi @('/i', $installerPath, '/qn', '/norestart')
$binary = Join-Path $installRoot 'Groot.exe'
$binaryDigest = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
if ($binaryDigest -cne $payloadDigest) {
    throw 'Installed Groot.exe differs from the verified MSI payload.'
}

$diagnosticsPath = Join-Path $dataRoot 'diagnostics-v1.jsonl'
if (Test-Path -LiteralPath $diagnosticsPath) {
    throw 'The MSI unexpectedly started Groot before the launch check.'
}
$started = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$app = Start-Process -FilePath $binary -WorkingDirectory $installRoot -PassThru
try {
    $elapsed = [Diagnostics.Stopwatch]::StartNew()
    while ($elapsed.Elapsed.TotalSeconds -lt 45) {
        $app.Refresh()
        if ($app.HasExited) {
            throw "Groot exited during Windows startup with code $($app.ExitCode)."
        }
        if ($app.MainWindowHandle -ne [IntPtr]::Zero -and
            $app.MainWindowTitle -match '^Groot(?:\s|$)' -and
            (Test-Path -LiteralPath $diagnosticsPath)) {
            $startup = Get-Content -LiteralPath $diagnosticsPath |
                ConvertFrom-Json -AsHashtable -ErrorAction SilentlyContinue |
                Where-Object {
                    $_['event'] -ceq 'app_started' -and $_['outcome'] -ceq 'succeeded' -and
                    $_['buildCommit'] -ceq $expectedCommit -and $_['compiledNetwork'] -ceq 'testnet4' -and
                    $_['timestamp'] -ge $started
                } | Select-Object -First 1
            if ($startup) {
                Start-Sleep -Seconds 3
                $app.Refresh()
                if ($app.HasExited -or $app.MainWindowHandle -eq [IntPtr]::Zero) {
                    throw 'Groot closed its main window shortly after Windows startup.'
                }
                Write-Host 'Windows Testnet4 MSI installed and launched the verified Groot window.'
                return
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'The installed Windows app did not produce a Groot window and successful Testnet4 startup.'
} finally {
    try {
        if (-not $app.HasExited) {
            if (-not $app.CloseMainWindow() -or -not $app.WaitForExit(5000)) {
                if (-not $app.HasExited) { $app.Kill() }
            }
        }
    } finally {
        $app.Dispose()
    }
}
