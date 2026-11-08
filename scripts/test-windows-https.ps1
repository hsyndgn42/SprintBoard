param([Parameter(Mandatory=$true)][string]$BuildManifest,[Parameter(Mandatory=$true)][string]$JdkPath)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest=Get-Content -LiteralPath $BuildManifest -Raw|ConvertFrom-Json
$jdk=(Resolve-Path -LiteralPath $JdkPath).Path
$qa=Join-Path $root ('tmp/https-tests-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qa | Out-Null
& (Join-Path $jdk 'bin/javac.exe') -encoding UTF-8 --release 21 -d $qa (Join-Path $root 'distribution/windows/DesktopSettings.java') (Join-Path $root 'distribution/windows/tests/DesktopTlsTest.java')
if($LASTEXITCODE -ne 0){throw 'HTTPS test compilation failed'}
& (Join-Path $jdk 'bin/java.exe') -cp $qa com.sprintboard.desktop.DesktopTlsTest $manifest.imageDirectory $qa
if($LASTEXITCODE -ne 0){throw "HTTPS tests failed: $qa"}
