param(
  [Parameter(Mandatory=$true)][string]$JdkPath,
  [Parameter(Mandatory=$true)][string]$WixPath,
  [string]$Version='0.1.1',
  [switch]$SkipBuild
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$jdk=(Resolve-Path -LiteralPath $JdkPath).Path
$wix=(Resolve-Path -LiteralPath $WixPath).Path
if($Version -notmatch '^\d{1,3}\.\d{1,3}\.\d{1,5}$'){throw 'Use a Windows installer version such as 0.1.0'}
foreach($tool in @('java.exe','javac.exe','jar.exe','jlink.exe','jpackage.exe')){if(!(Test-Path -LiteralPath (Join-Path $jdk "bin/$tool"))){throw "Missing JDK tool: $tool"}}
foreach($tool in @('candle.exe','light.exe')){if(!(Test-Path -LiteralPath (Join-Path $wix $tool))){throw 'WiX 3.14.1 binaries are required'}}
$originalJavaHome=$env:JAVA_HOME
$env:JAVA_HOME=$jdk
$originalPath=$env:PATH
$env:PATH="$wix;$jdk/bin;$env:PATH"
try{
  Push-Location $root
  try{
    $maven=Join-Path $root 'tools/apache-maven-3.9.16/bin/mvn.cmd'
    if(!(Test-Path -LiteralPath $maven)){$maven=(Get-Command mvn.cmd -ErrorAction Stop).Source}
    if(!$SkipBuild){
      & $maven '-Pwindows-installer' '-Dmaven.repo.local=.m2/repository' package
      if($LASTEXITCODE -ne 0){throw 'Application build/tests failed'}
    }
    $jar=Join-Path $root 'target/windows-installer/sprintboard-service-0.1.0.jar'
    if(!(Test-Path -LiteralPath $jar)){throw 'Installer-profile application JAR is missing'}
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive=[IO.Compression.ZipFile]::OpenRead($jar)
    try{
      if(!$archive.GetEntry('BOOT-INF/classes/com/sprintboard/DesktopLifecycle.class')){throw 'Desktop lifecycle support is missing'}
      if(!$archive.GetEntry('BOOT-INF/classes/static/index.html')){throw 'Production UI is missing'}
      $private=@($archive.Entries | Where-Object { $_.FullName -match '(^|/)(seed|backups|exports|team-photos)/|HistoricalTestDataLoader|\.(mv\.db|trace\.db|key|pfx|p12|jks)$|(^|/)application-local\.' })
      if($private.Count){throw 'Private/runtime data detected in application JAR'}
      foreach($entry in @($archive.Entries | Where-Object {$_.FullName.StartsWith('BOOT-INF/classes/') -and $_.Length -gt 0})){
        $reader=[IO.StreamReader]::new($entry.Open())
        try{$content=$reader.ReadToEnd()}finally{$reader.Dispose()}
        if($content -match 'xox[baprs]-[A-Za-z0-9-]{16,}|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'){throw "Credential-like material found in $($entry.FullName)"}
      }
    }finally{$archive.Dispose()}

    # New, allowlisted staging directory. No backup or live data path is ever an input.
    $build=Join-Path $root ('tmp/windows-installer-'+[guid]::NewGuid().ToString('N'))
    $payloadDir=Join-Path $build 'input';$classes=Join-Path $build 'classes';$resources=Join-Path $build 'resources'
    New-Item -ItemType Directory -Path $payloadDir,$classes,$resources,(Join-Path $payloadDir 'docs') | Out-Null
    $inventory=Join-Path $build 'runtime-dependencies.txt'
    & $maven '-Pwindows-installer' '-Dmaven.repo.local=.m2/repository' dependency:list '-DincludeScope=runtime' '-DoutputAbsoluteArtifactFilename=true' "-DoutputFile=$inventory"
    if($LASTEXITCODE -ne 0){throw 'Runtime dependency inventory failed'}
    $security=Join-Path $build 'security'
    & (Join-Path $PSScriptRoot 'check-package-security.ps1') -Jar $jar -DependencyList $inventory -OutputDirectory $security -JavaRelease (Join-Path $jdk 'release')
    foreach($report in @('DEPENDENCIES.cdx.json','SECURITY-CHECKS.json')){Copy-Item -LiteralPath (Join-Path $security $report) -Destination (Join-Path $payloadDir 'docs')}
    Copy-Item -LiteralPath $jar -Destination (Join-Path $payloadDir 'sprintboard-service.jar')
    Copy-Item -LiteralPath (Join-Path $root 'docs/USER_GUIDE.html') -Destination (Join-Path $payloadDir 'docs')
    Copy-Item -LiteralPath (Join-Path $root 'docs/USER_GUIDE.md') -Destination (Join-Path $payloadDir 'docs')
    Copy-Item -LiteralPath (Join-Path $root 'distribution/windows/account-recovery.md') -Destination (Join-Path $payloadDir 'docs')
    Copy-Item -LiteralPath (Join-Path $root 'distribution/windows/WINDOWS_SECURITY.md') -Destination (Join-Path $payloadDir 'docs')
    Copy-Item -LiteralPath (Join-Path $root 'distribution/windows/START-HERE.txt') -Destination $payloadDir
    foreach($doc in @(Get-ChildItem -LiteralPath $payloadDir -Recurse -File | Where-Object {$_.Extension -in @('.md','.html','.txt')})){
      if((Get-Content -LiteralPath $doc.FullName -Raw) -match 'xox[baprs]-[A-Za-z0-9-]{16,}|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'){throw 'Credential-like material found in packaged documentation'}
    }
    & (Join-Path $jdk 'bin/javac.exe') -encoding UTF-8 --release 21 -d $classes (Join-Path $root 'distribution/windows/SprintBoardLauncher.java') (Join-Path $root 'distribution/windows/DesktopSettings.java')
    if($LASTEXITCODE -ne 0){throw 'Desktop launcher compilation failed'}
    $testClasses=Join-Path $build 'test-classes';New-Item -ItemType Directory -Path $testClasses | Out-Null
    & (Join-Path $jdk 'bin/javac.exe') -encoding UTF-8 --release 21 -cp $classes -d $testClasses (Join-Path $root 'distribution/windows/tests/DesktopSettingsTest.java')
    if($LASTEXITCODE -ne 0){throw 'Desktop security test compilation failed'}
    & (Join-Path $jdk 'bin/java.exe') -cp "$classes;$testClasses" com.sprintboard.desktop.DesktopSettingsTest $build
    if($LASTEXITCODE -ne 0){throw 'Desktop security tests failed'}
    & (Join-Path $jdk 'bin/jar.exe') --create --file (Join-Path $payloadDir 'launcher.jar') --main-class com.sprintboard.desktop.SprintBoardLauncher -C $classes .
    if($LASTEXITCODE -ne 0){throw 'Desktop launcher packaging failed'}

    # Extend the existing blue S application icon; no personal image assets are copied.
    Add-Type -AssemblyName System.Drawing
    $bitmap=[Drawing.Bitmap]::new(256,256);$g=[Drawing.Graphics]::FromImage($bitmap)
    $g.Clear([Drawing.Color]::FromArgb(21,101,192));$g.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $font=[Drawing.Font]::new('Segoe UI',174,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
    $format=[Drawing.StringFormat]::new();$format.Alignment=[Drawing.StringAlignment]::Center;$format.LineAlignment=[Drawing.StringAlignment]::Center
    $g.DrawString('S',$font,[Drawing.Brushes]::White,[Drawing.RectangleF]::new(0,-8,256,256),$format)
    $png=[IO.MemoryStream]::new();$bitmap.Save($png,[Drawing.Imaging.ImageFormat]::Png);$bytes=$png.ToArray()
    $icon=Join-Path $resources 'SprintBoard.ico';$stream=[IO.File]::Create($icon);$writer=[IO.BinaryWriter]::new($stream)
    try{$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]1);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$bytes.Length);$writer.Write([uint32]22);$writer.Write($bytes)}finally{$writer.Dispose();$png.Dispose();$g.Dispose();$font.Dispose();$format.Dispose();$bitmap.Dispose()}
    $runtime=Join-Path $build 'runtime'
    & (Join-Path $jdk 'bin/jlink.exe') --add-modules java.se,jdk.crypto.ec,jdk.unsupported,jdk.charsets,jdk.localedata,jdk.zipfs,jdk.management --strip-debug --no-header-files --no-man-pages --output $runtime
    if($LASTEXITCODE -ne 0){throw 'Bundled Java runtime creation failed'}
    Copy-Item -LiteralPath (Join-Path $jdk 'NOTICE') -Destination $runtime
    $imageRoot=Join-Path $build 'image'
    & (Join-Path $jdk 'bin/jpackage.exe') --type app-image --name SprintBoard --app-version $Version --vendor SprintBoard --description 'SprintBoard sprint management' --input $payloadDir --main-jar launcher.jar --main-class com.sprintboard.desktop.SprintBoardLauncher --runtime-image $runtime --icon $icon --dest $imageRoot
    if($LASTEXITCODE -ne 0){throw 'Windows application image creation failed'}
    $image=Join-Path $imageRoot 'SprintBoard'
    $output=Join-Path $root ('releases/SprintBoard-Windows-'+$Version)
    if(Test-Path -LiteralPath $output){throw 'Release output already exists. Use a new version or archive the previous output.'}
    New-Item -ItemType Directory -Path $output | Out-Null
    $installerTemp=Join-Path $build 'installer'
    & (Join-Path $jdk 'bin/jpackage.exe') --verbose --type exe --name SprintBoard --app-version $Version --vendor SprintBoard --description 'SprintBoard sprint management' --app-image $image --dest $output --temp $installerTemp --win-per-user-install --win-dir-chooser --win-menu --win-menu-group SprintBoard --win-shortcut --win-upgrade-uuid '4a337b6c-3d18-48ae-8919-c4301e8b1471'
    if($LASTEXITCODE -ne 0){throw 'Windows EXE installer creation failed'}
    $exe=@(Get-ChildItem -LiteralPath $output -Filter '*.exe')
    if($exe.Count -ne 1){throw 'Expected one Windows setup EXE'}
    $final=Join-Path $output "SprintBoard-$Version-Windows-x64-Setup.exe"
    Move-Item -LiteralPath $exe[0].FullName -Destination $final
    Copy-Item -LiteralPath (Join-Path $root 'distribution/windows/START-HERE.txt') -Destination $output
    Copy-Item -LiteralPath (Join-Path $root 'distribution/windows/WINDOWS_SECURITY.md') -Destination $output
    foreach($report in @('DEPENDENCIES.cdx.json','SECURITY-CHECKS.json')){Copy-Item -LiteralPath (Join-Path $security $report) -Destination $output}
    $hash=(Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'),"$hash  $([IO.Path]::GetFileName($final))`n",[Text.UTF8Encoding]::new($false))
    $commit=(& git rev-parse HEAD).Trim()
    $manifest=[ordered]@{version=$Version;sourceCommit=$commit;sourceDirty=(@(& git status --porcelain).Count -gt 0);java=(Get-Content (Join-Path $runtime 'release') | Where-Object {$_ -match '^JAVA_VERSION='});installerSha256=$hash;serviceJarSha256=(Get-FileHash -LiteralPath $jar).Hash;containsUserData=$false;containsCredentials=$false;dataDirectory='%LOCALAPPDATA%\SprintBoardData';buildDirectory=$build;imageDirectory=$image;installerDirectory=$output}
    $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $build 'build-manifest.json') -Encoding UTF8
    Write-Output "INSTALLER=$final"
    Write-Output "BUILD_MANIFEST=$(Join-Path $build 'build-manifest.json')"
    Get-Item -LiteralPath $final | Select-Object FullName,Length
  }finally{Pop-Location}
}finally{$env:PATH=$originalPath;$env:JAVA_HOME=$originalJavaHome}
