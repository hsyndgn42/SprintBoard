param(
  [Parameter(Mandatory=$true)][string]$ExistingDatabase,
  [Parameter(Mandatory=$true)][string]$ServiceJar,
  [Parameter(Mandatory=$true)][string]$OldH2Jar,
  [Parameter(Mandatory=$true)][string]$NewH2Jar,
  [Parameter(Mandatory=$true)][string]$JdkPath
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source=(Resolve-Path -LiteralPath $ExistingDatabase).Path
$jar=(Resolve-Path -LiteralPath $ServiceJar).Path
$oldDriver=(Resolve-Path -LiteralPath $OldH2Jar).Path;$newDriver=(Resolve-Path -LiteralPath $NewH2Jar).Path
$jdk=(Resolve-Path -LiteralPath $JdkPath).Path
$qa=Join-Path $root ('tmp/database-upgrade-qa-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qa | Out-Null
$copy=Join-Path $qa 'sprintboard.mv.db';$db=Join-Path $qa 'sprintboard'
# Exclusive read protects against copying a live, changing H2 file. Source is never opened by H2.
$inputStream=[IO.File]::Open($source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
try{$outputStream=[IO.File]::Create($copy);try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose()}}finally{$inputStream.Dispose()}
$originalHash=(Get-FileHash -LiteralPath $source).Hash
& (Join-Path $jdk 'bin/javac.exe') -encoding UTF-8 -d $qa (Join-Path $root 'distribution/windows/tests/DatabaseFingerprint.java')
if($LASTEXITCODE -ne 0){throw 'Database comparison helper compilation failed'}
& (Join-Path $jdk 'bin/java.exe') -cp "$qa;$oldDriver" DatabaseFingerprint $db (Join-Path $qa 'before.tsv')
if($LASTEXITCODE -ne 0){throw 'Old runtime could not read the isolated database copy'}
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$params=@('-Duser.language=tr','-Duser.country=TR','-Duser.timezone=Europe/Istanbul','-jar',('"'+$jar+'"'),"--server.address=127.0.0.1","--server.port=$port",('--spring.datasource.url="jdbc:h2:file:'+($db.Replace('\','/'))+';IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0"'),'--sprintboard.desktop.managed=true','--sprintboard.slack.worker-enabled=false','--sprintboard.slack.digest.scheduler-enabled=false','--sprintboard.jira.worker-enabled=false','--sprintboard.auto-backup.enabled=false')
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $jdk 'bin/java.exe';$start.Arguments=$params -join ' ';$start.WorkingDirectory=$qa;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($key in @($start.EnvironmentVariables.Keys)){if($key -match '^(SPRINTBOARD_|SPRING_|SERVER_|MANAGEMENT_|LOGGING_)|^(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS|CLASSPATH)$'){$start.EnvironmentVariables.Remove($key)}}
$server=[Diagnostics.Process]::Start($start);$stdout=$server.StandardOutput.ReadToEndAsync();$stderr=$server.StandardError.ReadToEndAsync()
try{
  $ready=$false
  for($i=0;$i -lt 100 -and !$server.HasExited;$i++){
    try{if((Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 2).status -eq 'ok'){$ready=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
  }
  if(!$ready){throw "Updated service did not open isolated database copy: $qa"}
}finally{
  if(!$server.HasExited){$server.StandardInput.WriteLine('STOP');$server.StandardInput.Flush();if(!$server.WaitForExit(40000)){$server.Kill();throw 'Upgrade QA graceful stop failed'}}
  [IO.File]::WriteAllText((Join-Path $qa 'service.log'),$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult())
}
if($server.ExitCode -ne 0){throw 'Upgrade QA service exited unsuccessfully'}
& (Join-Path $jdk 'bin/java.exe') -cp "$qa;$newDriver" DatabaseFingerprint $db (Join-Path $qa 'after.tsv')
if($LASTEXITCODE -ne 0){throw 'Updated runtime could not read isolated database copy'}
$before=Get-Content (Join-Path $qa 'before.tsv');$after=Get-Content (Join-Path $qa 'after.tsv')
$differences=@(Compare-Object $before $after)
if((Get-FileHash -LiteralPath $source).Hash -ne $originalHash){throw 'Original database changed during test'}
if($differences.Count){throw "Table data changed during isolated upgrade; inspect fingerprints in $qa"}
[ordered]@{result='PASS';tables=$before.Count;originalUnchanged=$true;slackAndJiraWorkersDisabled=$true;serviceJarSha256=(Get-FileHash -LiteralPath $jar).Hash;completedAt=(Get-Date -Format o)}|ConvertTo-Json|Set-Content (Join-Path $qa 'qa-result.json') -Encoding UTF8
Write-Output "PASS: all $($before.Count) tables match after runtime upgrade; original database unchanged. QA_RESULT=$qa/qa-result.json"
