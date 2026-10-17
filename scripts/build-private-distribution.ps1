param(
  [Parameter(Mandatory=$true)][string]$BackupZip,
  [Parameter(Mandatory=$true)][string]$JdkPath,
  [string]$Name = ('SprintBoard-Hazir-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Name -notmatch '^SprintBoard-Hazir-[a-zA-Z0-9-]+$') { throw 'Invalid package name' }
$releaseRoot = Join-Path $root 'releases'
$package = Join-Path $releaseRoot $Name
$archive = $package + '.zip'
if ((Test-Path -LiteralPath $package) -or (Test-Path -LiteralPath $archive)) { throw 'Output already exists; choose another name' }
$backup = (Resolve-Path -LiteralPath $BackupZip).Path
$jar = Join-Path $root 'target/sprintboard-service-0.1.0.jar'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$jarZip = [IO.Compression.ZipFile]::OpenRead($jar)
try {
  if (@($jarZip.Entries | Where-Object { $_.FullName -match '(^|/)seed/|HistoricalTestDataLoader|\.mv\.db$|slack-token\.key$' }).Count) { throw 'JAR contains private data or test loader' }
} finally { $jarZip.Dispose() }
New-Item -ItemType Directory -Path (Join-Path $package 'target'),(Join-Path $package 'service/data'),(Join-Path $package 'docs') -Force | Out-Null
Copy-Item -LiteralPath $jar -Destination (Join-Path $package 'target')
Copy-Item -LiteralPath (Join-Path $root 'start-sprintboard.cmd') -Destination $package
Copy-Item -LiteralPath (Join-Path $root 'docs/PRIVATE-DISTRIBUTION.txt') -Destination (Join-Path $package 'PRIVATE-DISTRIBUTION.txt')
foreach($doc in @('USER_GUIDE.html','USER_GUIDE.md','account-recovery.md')) { Copy-Item -LiteralPath (Join-Path $root ('docs/'+$doc)) -Destination (Join-Path $package 'docs') }
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $package
# Extract only known entries; do not trust archive-supplied filesystem paths.
$outer = [IO.Compression.ZipFile]::OpenRead($backup)
try {
  $entry = $outer.GetEntry('database.zip')
  if (!$entry) { throw 'Full backup database.zip missing' }
  $stream = $entry.Open()
  $nested = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Read)
  try {
    $databases = @($nested.Entries | Where-Object { $_.FullName.EndsWith('.mv.db') })
    if ($databases.Count -ne 1) { throw 'Expected exactly one database' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($databases[0],(Join-Path $package 'service/data/sprintboard.mv.db'))
  } finally { $nested.Dispose(); $stream.Dispose() }
  $key = $outer.GetEntry('slack-token.key')
  if (!$key) { throw 'Local Slack key missing; external Secret packaging is not supported' }
  [IO.Compression.ZipFileExtensions]::ExtractToFile($key,(Join-Path $package 'service/data/slack-token.key'))
} finally { $outer.Dispose() }
$jlink = Join-Path $JdkPath 'bin/jlink.exe'
& $jlink --add-modules java.se,jdk.crypto.ec,jdk.unsupported,jdk.charsets,jdk.localedata,jdk.zipfs,jdk.management --strip-debug --no-header-files --no-man-pages --output (Join-Path $package 'runtime')
if ($LASTEXITCODE -ne 0) { throw 'Runtime creation failed' }
Copy-Item -LiteralPath (Join-Path $JdkPath 'NOTICE') -Destination (Join-Path $package 'runtime')
[IO.Compression.ZipFile]::CreateFromDirectory($package,$archive,[IO.Compression.CompressionLevel]::Optimal,$true)
Get-Item -LiteralPath $archive | Select-Object FullName,Length
Get-FileHash -LiteralPath $archive -Algorithm SHA256
