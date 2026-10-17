param([Parameter(Mandatory=$true)][string]$PackageZip)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$temp=Join-Path $root ('tmp/distribution-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path -LiteralPath $PackageZip).Path,$temp)
$package=@(Get-ChildItem -LiteralPath $temp -Directory)[0].FullName
$java=Join-Path $package 'runtime/bin/java.exe'
$jar=Join-Path $package 'target/sprintboard-service-0.1.0.jar'
$fresh=Join-Path $temp 'empty'
New-Item -ItemType Directory -Path $fresh | Out-Null
Copy-Item -LiteralPath (Join-Path $package 'service/data/sprintboard.mv.db') -Destination (Join-Path $temp 'before.mv.db')
$process=$null
function Start-TestService([string]$folder,[int]$port) {
  $args=@('-jar',('"' + $jar + '"'),"--server.port=$port",'--sprintboard.slack.worker-enabled=false','--sprintboard.slack.digest.scheduler-enabled=false','--sprintboard.auto-backup.enabled=false')
  $script:process=Start-Process -FilePath $java -ArgumentList $args -WorkingDirectory $folder -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $folder 'test.log') -RedirectStandardError (Join-Path $folder 'test.err')
  for($i=0;$i -lt 80;$i++) {
    if($script:process.HasExited){throw "Test service failed; inspect $folder/test.log"}
    try { $health=Invoke-RestMethod "http://127.0.0.1:$port/api/health"; if($health.status -eq 'ok'){return} } catch {}
    Start-Sleep -Milliseconds 500
  }
  throw 'Test service startup timeout'
}
function Stop-TestService { if($script:process -and !$script:process.HasExited){Stop-Process -Id $script:process.Id; $script:process.WaitForExit()};$script:process=$null }
try {
  Start-TestService $fresh 4186
  $url='http://127.0.0.1:4186'
  $session=Invoke-RestMethod "$url/api/auth/session" -SessionVariable cookie
  if(!$session.setupRequired){throw 'Fresh installation did not require admin setup'}
  $page=Invoke-WebRequest $url
  if($page.Content -notmatch 'main-[A-Z0-9]+\.js'){throw 'Packaged UI missing'}
  $password='Disposable-QA-'+[guid]::NewGuid().ToString('N')
  $payload=@{username='distribution.test';password=$password}|ConvertTo-Json
  Invoke-RestMethod "$url/api/auth/setup" -Method Post -WebSession $cookie -Headers @{'X-CSRF-TOKEN'=$session.csrfToken} -ContentType 'application/json' -Body $payload | Out-Null
  Invoke-WebRequest "$url/login" -Method Post -WebSession $cookie -Headers @{'X-CSRF-TOKEN'=$session.csrfToken} -Body @{username='distribution.test';password=$password} | Out-Null
  $session=Invoke-RestMethod "$url/api/auth/session" -WebSession $cookie
  if(!$session.authenticated -or $session.role -ne 'ADMIN'){throw 'Fresh admin login failed'}
  foreach($endpoint in @('team','sprints','backlog','roadmap')) {
    $items=Invoke-RestMethod "$url/api/$endpoint" -WebSession $cookie
    if($items.Count -ne 0){throw "Fresh $endpoint is not empty"}
  }
  Stop-TestService
  Start-TestService $fresh 4186
  $session=Invoke-RestMethod "$url/api/auth/session"
  if($session.setupRequired){throw 'Created account lost on restart'}
  Stop-TestService
  'PASS: packaged runtime, empty DB, UI, admin setup/login and persisted restart.'
  Start-TestService $package 4187
  $session=Invoke-RestMethod 'http://127.0.0.1:4187/api/auth/session'
  if($session.setupRequired){throw 'Private package lost existing accounts'}
  Stop-TestService
  $classpath=Join-Path $root '.m2/repository/com/h2database/h2/2.3.232/h2-2.3.232.jar'
  if(!(Test-Path $classpath)){throw 'H2 verification dependency missing'}
  & java --class-path $classpath (Join-Path $root 'scripts/CompareOfflineDatabases.java') (Join-Path $temp 'before.mv.db') (Join-Path $package 'service/data/sprintboard.mv.db')
  if($LASTEXITCODE -ne 0){throw 'Database comparison could not be verified; inspect the verifier output'}
  'PASS: private package starts with retained accounts and no Slack network worker.'
  "QA_DIRECTORY=$temp"
} finally { Stop-TestService }
