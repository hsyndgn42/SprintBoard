param(
  [Parameter(Mandatory=$true)][string]$Jar,
  [Parameter(Mandatory=$true)][string]$DependencyList,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][string]$JavaRelease
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$jarPath=(Resolve-Path -LiteralPath $Jar).Path
$out=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $out -Force | Out-Null
$javaLine=Get-Content -LiteralPath $JavaRelease | Where-Object {$_ -match '^JAVA_VERSION='}
if($javaLine -notmatch '"(21\.0\.(\d+))"' -or [int]$Matches[2] -lt 13){throw 'A patched Java 21 runtime (21.0.13 or later) is required'}
$javaVersion=$Matches[1]
$dependencies=@{}
foreach($line in Get-Content -LiteralPath $DependencyList){
  if($line -match '^\s+([^: ]+):([^: ]+):jar:([^: ]+):(compile|runtime):(.+?)(?: -- module.*)?$'){
    $path=$Matches[5].Trim();$name=[IO.Path]::GetFileName($path)
    if($dependencies.ContainsKey($name)){throw "Duplicate dependency filename: $name"}
    $dependencies[$name]=@{group=$Matches[1];artifact=$Matches[2];version=$Matches[3];path=$path}
  }
}
if($dependencies.Count -lt 10){throw 'Incomplete Maven runtime dependency inventory'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($jarPath)
$components=@();$queries=@()
try{
  foreach($entry in @($archive.Entries | Where-Object {$_.FullName -match '^BOOT-INF/lib/[^/]+\.jar$'})){
    $name=$entry.Name;$dep=$dependencies[$name]
    if(!$dep -and $name -match '^spring-boot-jarmode-tools-(.+)\.jar$'){
      $dep=@{group='org.springframework.boot';artifact='spring-boot-jarmode-tools';version=$Matches[1]}
    }
    if(!$dep){throw "Unidentified packaged dependency: $name"}
    $sha=[Security.Cryptography.SHA256]::Create();$stream=$entry.Open()
    try{$hash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}
    if($dep.path -and (Get-FileHash -LiteralPath $dep.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){throw "Packaged library differs from resolved dependency: $name"}
    $purl="pkg:maven/$($dep.group)/$($dep.artifact)@$($dep.version)"
    $components+=@{type='library';group=$dep.group;name=$dep.artifact;version=$dep.version;purl=$purl;'bom-ref'=$purl;hashes=@(@{alg='SHA-256';content=$hash})}
    $queries+=@{package=@{ecosystem='Maven';name="$($dep.group):$($dep.artifact)"};version=$dep.version}
  }
}finally{$archive.Dispose()}
if($queries.Count -lt 10){throw 'No complete packaged dependency inventory'}
$javaCount=$queries.Count
$findings=@()
for($offset=0;$offset -lt $queries.Count;$offset+=100){
  $batch=@($queries | Select-Object -Skip $offset -First 100)
  $response=Invoke-RestMethod -Uri 'https://api.osv.dev/v1/querybatch' -Method Post -ContentType 'application/json' -Body (@{queries=$batch}|ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 60
  if(@($response.results).Count -ne $batch.Count){throw 'Incomplete OSV response'}
  for($i=0;$i -lt $batch.Count;$i++){
    $result=$response.results[$i]
    do{
      foreach($vulnerability in $result.vulns){$findings+=@{package=$batch[$i].package.name;version=$batch[$i].version;id=$vulnerability.id}}
      $token=$result.next_page_token
      if($token){$next=$batch[$i].Clone();$next.page_token=$token;$result=Invoke-RestMethod -Uri 'https://api.osv.dev/v1/query' -Method Post -ContentType 'application/json' -Body ($next|ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 60}
    }while($token)
  }
}
Push-Location (Join-Path $root 'frontend')
try{
  $auditText=(& npm.cmd audit --json 2> (Join-Path $out 'npm-audit.stderr.txt')) -join "`n"
  $auditExit=$LASTEXITCODE
  $audit=$auditText|ConvertFrom-Json
  if($audit.error -or !$audit.metadata -or $auditExit -notin @(0,1)){throw 'npm vulnerability check did not complete'}
  [IO.File]::WriteAllText((Join-Path $out 'npm-audit.json'),$auditText,[Text.UTF8Encoding]::new($false))
}finally{Pop-Location}
$npmText=(& node (Join-Path $PSScriptRoot 'npm-sbom.cjs') (Join-Path $root 'frontend/package-lock.json')) -join "`n"
if($LASTEXITCODE -ne 0){throw 'npm inventory failed'}
$npmComponents=@($npmText|ConvertFrom-Json)
$components+=$npmComponents
$components+=@{type='framework';name='Eclipse Temurin Java Runtime';version=$javaVersion;'bom-ref'="temurin-java-$javaVersion"}
$now=[DateTime]::UtcNow.ToString('o')
$bom=[ordered]@{bomFormat='CycloneDX';specVersion='1.6';serialNumber=('urn:uuid:'+([guid]::NewGuid()));version=1;metadata=@{timestamp=$now;component=@{type='application';name='SprintBoard';hashes=@(@{alg='SHA-256';content=(Get-FileHash -LiteralPath $jarPath).Hash.ToLowerInvariant()})}};components=$components}
$bom|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $out 'DEPENDENCIES.cdx.json') -Encoding UTF8
$report=[ordered]@{checkedAt=$now;result='PASS';serviceJarSha256=(Get-FileHash -LiteralPath $jarPath).Hash.ToLowerInvariant();javaRuntime=$javaVersion;maven=@{source='https://api.osv.dev';packagedLibraries=$javaCount;findings=$findings};npm=@{source='https://registry.npmjs.org';scope='all dependencies including build tools';vulnerabilities=$audit.metadata.vulnerabilities};signature='Unsigned; code signing deferred by product owner';limits=@('Known dependency advisories at scan time, not a penetration test or malware certification.','JDK patch minimum checked; JDK and native installer binaries are not covered by the Maven/npm advisory scan.','Database and full backup files require filesystem access protection; they are not fully encrypted.')}
if($findings.Count -or $audit.metadata.vulnerabilities.total -ne 0){$report.result='FAIL'}
$report|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $out 'SECURITY-CHECKS.json') -Encoding UTF8
if($report.result -ne 'PASS'){throw "Dependency gate failed: $($findings.Count) Java findings, $($audit.metadata.vulnerabilities.total) npm findings. See SECURITY-CHECKS.json"}
Write-Output "PASS: $javaCount packaged Java libraries and all npm dependencies checked; no known advisories returned."
