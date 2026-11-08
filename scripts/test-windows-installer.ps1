param([Parameter(Mandatory=$true)][string]$BuildManifest,[switch]$AppImageOnly)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest=Get-Content -LiteralPath (Resolve-Path -LiteralPath $BuildManifest).Path -Raw | ConvertFrom-Json
$setup=@(Get-ChildItem -LiteralPath $manifest.installerDirectory -Filter '*-Setup.exe')[0].FullName
$qa=Join-Path $root ('tmp/windows-setup-qa-'+[guid]::NewGuid().ToString('N'))
$install=Join-Path $qa 'App';$data=Join-Path $qa 'Team Data'
if($AppImageOnly){$install=$manifest.imageDirectory}
New-Item -ItemType Directory -Path $qa,$data | Out-Null
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$url="http://127.0.0.1:$port"
$launcher=$null;$installed=$false;$password='Installer-QA-'+[guid]::NewGuid().ToString('N')
$expectedHash=(Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
if($expectedHash -ne $manifest.installerSha256){throw 'Installer does not match build manifest'}
function Get-SprintBoardInstallation {
  foreach($key in @('HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*','HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*','HKLM:/Software/WOW6432Node/Microsoft/Windows/CurrentVersion/Uninstall/*')){
    Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq 'SprintBoard'}
  }
}
if(!$AppImageOnly){
  if(@(Get-SprintBoardInstallation).Count){throw 'An installed SprintBoard already exists; do not replace it during QA. Use -AppImageOnly.'}
  if((Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'SprintBoard.lnk')) -or (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) 'SprintBoard'))){throw 'Existing SprintBoard shortcuts must not be overwritten during QA. Use -AppImageOnly.'}
}
function Install-TestPackage {
  if(!$AppImageOnly){
  $params=@('/qn','/norestart',('INSTALLDIR="'+$install+'"'),'/L*V!',('"'+(Join-Path $qa 'install.log')+'"'))
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$setup;$start.Arguments=$params -join ' ';$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $process=[Diagnostics.Process]::Start($start)
  if(!$process.WaitForExit(120000)){throw 'Installer timeout; check QA install.log'}
  if($process.ExitCode -notin @(0,3010)){throw "Setup failed: $($process.ExitCode); inspect $qa/install.log"}
  $script:installed=$true
  }
  if(!(Test-Path -LiteralPath (Join-Path $install 'SprintBoard.exe'))){throw 'Native EXE missing after installation'}
  if((Get-FileHash -LiteralPath (Join-Path $install 'app/sprintboard-service.jar')).Hash -ne $manifest.serviceJarSha256){throw 'Installed service differs from verified payload'}
  if(@(Get-ChildItem -LiteralPath $install -Recurse -File | Where-Object {$_.Name -match '\.(mv\.db|trace\.db|key)$'}).Count){throw 'Installer payload contains database or private key files'}
  if(!(Test-Path -LiteralPath (Join-Path $install 'runtime/bin/java.exe'))){throw 'Bundled Java missing'}
}
function Start-TestLauncher {
  $params=@(('--data-dir="'+$data+'"'),"--port=$port",'--headless','--no-browser')
  $script:launcher=Start-Process -FilePath (Join-Path $install 'SprintBoard.exe') -ArgumentList $params -WorkingDirectory $qa -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $qa 'launcher.out') -RedirectStandardError (Join-Path $qa 'launcher.err')
  for($i=0;$i -lt 100;$i++){
    if($script:launcher.HasExited){throw "Launcher exited: $($script:launcher.ExitCode); inspect $qa/launcher.err and Team Data/logs/service.log"}
    try{if((Invoke-RestMethod "$url/api/health" -TimeoutSec 2).status -eq 'ok'){return}}catch{}
    Start-Sleep -Milliseconds 500
  }
  throw 'Packaged application did not become healthy'
}
function Stop-TestLauncher {
  if($script:launcher -and !$script:launcher.HasExited){
    $stopper=Start-Process -FilePath (Join-Path $install 'SprintBoard.exe') -ArgumentList @(('--data-dir="'+$data+'"'),'--stop','--headless') -WindowStyle Hidden -PassThru
    if(!$stopper.WaitForExit(15000)){throw 'Stop request timed out'}
    if(!$script:launcher.WaitForExit(40000)){throw 'Managed shutdown timed out'}
    if($script:launcher.ExitCode -ne 0){throw 'Managed shutdown failed'}
  }
  $script:launcher=$null
}
function Uninstall-TestPackage {
  if($AppImageOnly){return}
  $entries=@(Get-SprintBoardInstallation)
  if($entries.Count -ne 1 -or !$entries[0].InstallLocation -or [IO.Path]::GetFullPath($entries[0].InstallLocation).TrimEnd('\') -ne [IO.Path]::GetFullPath($install).TrimEnd('\')){throw 'Refusing uninstall: registered path does not match QA installation'}
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$setup;$start.Arguments='uninstall';$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $process=[Diagnostics.Process]::Start($start)
  if(!$process.WaitForExit(120000) -or $process.ExitCode -notin @(0,3010)){throw 'QA uninstall failed'}
  $script:installed=$false
}
function Login-TestAdmin {
  $session=Invoke-RestMethod "$url/api/auth/session" -SessionVariable cookie
  Invoke-WebRequest "$url/login" -Method Post -WebSession $cookie -Headers @{'X-CSRF-TOKEN'=$session.csrfToken} -Body @{username='installer.qa';password=$password} -UseBasicParsing | Out-Null
  $session=Invoke-RestMethod "$url/api/auth/session" -WebSession $cookie
  if(!$session.authenticated -or $session.role -ne 'ADMIN'){throw 'Admin login failed'}
  $script:adminCookie=$cookie;$script:headers=@{'X-CSRF-TOKEN'=$session.csrfToken}
}
try{
  Install-TestPackage
  Write-Output "PASS: native launcher, bundled Java and clean payload (app-image only: $AppImageOnly)."
  # Deliberately poison inherited deployment variables. The packaged launcher must ignore them.
  $oldDb=$env:SPRINTBOARD_DB_PATH;$oldSlack=$env:SPRINTBOARD_SLACK_BOT_TOKEN
  $env:SPRINTBOARD_DB_PATH=Join-Path $qa 'must-not-create/database';$env:SPRINTBOARD_SLACK_BOT_TOKEN='test-only-must-not-inherit'
  try{Start-TestLauncher}finally{if($null -eq $oldDb){Remove-Item Env:SPRINTBOARD_DB_PATH -ErrorAction SilentlyContinue}else{$env:SPRINTBOARD_DB_PATH=$oldDb};if($null -eq $oldSlack){Remove-Item Env:SPRINTBOARD_SLACK_BOT_TOKEN -ErrorAction SilentlyContinue}else{$env:SPRINTBOARD_SLACK_BOT_TOKEN=$oldSlack}}
  $session=Invoke-RestMethod "$url/api/auth/session" -SessionVariable setupCookie
  if(!$session.setupRequired){throw 'Fresh database did not require initial admin'}
  Invoke-RestMethod "$url/api/auth/setup" -Method Post -WebSession $setupCookie -Headers @{'X-CSRF-TOKEN'=$session.csrfToken} -ContentType 'application/json' -Body (@{username='installer.qa';password=$password}|ConvertTo-Json) | Out-Null
  Login-TestAdmin
  foreach($endpoint in @('team','sprints','backlog','roadmap','leaves','overtime/entries')){
    $records=Invoke-RestMethod "$url/api/$endpoint" -WebSession $adminCookie
    if($records.Count -ne 0){throw "Fresh $endpoint contains unexpected data"}
  }
  if((Invoke-RestMethod "$url/api/settings" -WebSession $adminCookie).teamName -ne 'SprintBoard'){throw 'Team branding not neutral'}
  foreach($endpoint in @('jira','confluence')){$config=Invoke-RestMethod "$url/api/admin/$endpoint" -WebSession $adminCookie;if($config.enabled -or $config.patConfigured -or $config.baseUrl){throw "Copied $endpoint connection found"}}
  $slack=Invoke-RestMethod "$url/api/admin/slack" -WebSession $adminCookie
  if($slack.enabled -or $slack.teamId -or $slack.channelId -or $slack.botTokenConfigured -or $slack.appTokenConfigured){throw 'Copied Slack configuration found'}
  if(Test-Path -LiteralPath (Join-Path $qa 'must-not-create/database.mv.db')){throw 'Launcher inherited an unrelated database path'}
  Write-Output 'PASS: empty team/sprints/backlog/roadmap/leaves/overtime; first admin; neutral name; no integration credentials.'
  $firstPid=$launcher.Id
  $second=Start-Process -FilePath (Join-Path $install 'SprintBoard.exe') -ArgumentList @(('--data-dir="'+$data+'"'),'--headless','--no-browser') -WindowStyle Hidden -PassThru
  if(!$second.WaitForExit(15000) -or $second.ExitCode -ne 0 -or $launcher.HasExited){throw 'Single-instance launcher failed'}
  $item=Invoke-RestMethod "$url/api/backlog" -Method Post -WebSession $adminCookie -Headers $headers -ContentType 'application/json' -Body (@{title='Disposable installer persistence test';taskCategory='DEV';size='SMALL';estimatedHours=8}|ConvertTo-Json)
  $backup=Invoke-RestMethod "$url/api/admin/backups/full" -Method Post -WebSession $adminCookie -Headers $headers -ContentType 'application/json' -Body '{}'
  if(!(Test-Path -LiteralPath (Join-Path $data ('backups/scheduled/'+$backup.filename)))){throw 'Packaged backup missing'}
  Stop-TestLauncher
  if((Get-Content -LiteralPath (Join-Path $data 'logs/service.log') -Raw) -notmatch 'Shutdown completed'){throw 'Database pool did not shut down cleanly'}
  Start-TestLauncher;Login-TestAdmin
  $items=@(Invoke-RestMethod "$url/api/backlog" -WebSession $adminCookie)
  if($items.Count -ne 1 -or $items[0].id -ne $item.id){throw 'Saved work was not retained on restart'}
  Stop-TestLauncher
  Write-Output 'PASS: single instance, application backup, graceful shutdown and persisted restart.'
  $dbFile=Join-Path $data 'service/data/sprintboard.mv.db'
  $dbHash=(Get-FileHash -LiteralPath $dbFile).Hash
  Uninstall-TestPackage
  if(!(Test-Path -LiteralPath $dbFile) -or (Get-FileHash -LiteralPath $dbFile).Hash -ne $dbHash){throw 'Uninstall changed or deleted team data'}
  Install-TestPackage
  Start-TestLauncher;Login-TestAdmin
  $items=@(Invoke-RestMethod "$url/api/backlog" -WebSession $adminCookie)
  if($items.Count -ne 1 -or $items[0].id -ne $item.id){throw 'Reinstall did not preserve team data'}
  Stop-TestLauncher
  if(!$AppImageOnly){Write-Output 'PASS: uninstall/reinstall preserves data and the admin account.'}
  $held=$dbFile+'.qa-held';Move-Item -LiteralPath $dbFile -Destination $held
  try{
    $missing=Start-Process -FilePath (Join-Path $install 'SprintBoard.exe') -ArgumentList @(('--data-dir="'+$data+'"'),'--headless','--no-browser') -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $qa 'missing-db.err')
    if(!$missing.WaitForExit(10000) -or $missing.ExitCode -eq 0 -or (Test-Path -LiteralPath $dbFile)){throw 'Missing existing database was silently replaced'}
  }finally{Move-Item -LiteralPath $held -Destination $dbFile}
  Write-Output 'PASS: a missing existing DB cannot silently become an empty installation.'
  Uninstall-TestPackage
  if((Get-FileHash -LiteralPath $setup).Hash.ToLowerInvariant() -ne $expectedHash){throw 'Release installer changed during QA'}
  $checks=@('bundled-java','empty-workspace','no-credentials','admin-setup','environment-isolation','single-instance','manual-backup','graceful-stop','restart','missing-db-guard')
  if(!$AppImageOnly){$checks+=@('real-exe-install','uninstall-preserves-data','reinstall')}
  [ordered]@{result='PASS';version=$manifest.version;installerSha256=$expectedHash;checks=$checks;qaDirectory=$qa;completedAt=(Get-Date -Format o)}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qa 'qa-result.json') -Encoding UTF8
  Write-Output "QA_RESULT=$(Join-Path $qa 'qa-result.json')"
}finally{
  if($launcher -and !$launcher.HasExited){Stop-TestLauncher}
  if($installed){Uninstall-TestPackage}
}
