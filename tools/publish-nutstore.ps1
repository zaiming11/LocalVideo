param(
    [ValidateSet('Inspect','InspectQuota','Publish','ReadVersion','DeleteAssets')][string]$Action = 'Inspect',
    [string]$Manifest,
    [string]$PackageDirectory,
    [switch]$PackagesOnly,
    [ValidateSet('windows','android')][string[]]$Platforms = @('windows','android'),
    [string[]]$AssetNames = @(),
    [string]$CredentialFile = (Join-Path $env:LOCALAPPDATA 'LocalVideoPublisher/nutstore.json')
)
$ErrorActionPreference = 'Stop'
$taskConfig = Get-Content -LiteralPath $CredentialFile -Raw | ConvertFrom-Json
$taskBase = [Uri]::new($taskConfig.baseUrl)
if ($taskBase.Scheme -ne 'https' -or $taskBase.Host -ne 'dav.jianguoyun.com' -or -not $taskBase.IsDefaultPort) { throw 'Only the official Nutstore HTTPS WebDAV endpoint is accepted.' }
if ($taskConfig.folder -notmatch '^[A-Za-z0-9_-]+$') { throw 'Invalid cloud folder name.' }
$taskRoot = $taskConfig.baseUrl.TrimEnd('/') + '/' + $taskConfig.folder + '/'
$taskPlain = [Net.NetworkCredential]::new('', (ConvertTo-SecureString $taskConfig.password)).Password
$taskAuthorization = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskConfig.username + ':' + $taskPlain))
$taskHandler = [Net.Http.HttpClientHandler]::new(); $taskHandler.AllowAutoRedirect = $false; $taskHandler.UseProxy = $false
$taskHttp = [Net.Http.HttpClient]::new($taskHandler); $taskHttp.Timeout = [TimeSpan]::FromMinutes(60)
function Send-Dav([string]$Method, [string]$Name, [Net.Http.HttpContent]$Content = $null, [Uri]$DirectUrl = $null, [bool]$UseAuth = $true, [int]$Hops = 0) {
    $taskUri = if ($DirectUrl) { $DirectUrl } else { [Uri]::new($taskRoot + [Uri]::EscapeDataString($Name)) }
    if ($taskUri.Scheme -ne 'https' -or $taskUri.UserInfo) { throw 'Only HTTPS download redirects are accepted.' }
    $taskRequest = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $taskUri)
    if ($UseAuth -and $taskUri.Host -eq 'dav.jianguoyun.com' -and $taskUri.IsDefaultPort) { $taskRequest.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Basic', $taskAuthorization) }
    if ($Method -eq 'PROPFIND') { $taskRequest.Headers.Add('Depth', '1') }
    if ($Content) { $taskRequest.Content = $Content }
    try {
        $taskPending = $taskHttp.SendAsync($taskRequest, [Net.Http.HttpCompletionOption]::ResponseHeadersRead)
        $taskLastProgress = [DateTime]::UtcNow
        while (-not $taskPending.IsCompleted) {
            Start-Sleep -Milliseconds 500
            if ($Method -eq 'PUT' -and $Content -is [Net.Http.StreamContent] -and ([DateTime]::UtcNow - $taskLastProgress).TotalSeconds -ge 10) {
                Write-Host ('Upload progress: ' + $Name + ' ' + [Math]::Floor($taskStream.Position * 100 / $taskStream.Length) + '%')
                $taskLastProgress = [DateTime]::UtcNow
            }
        }
        $taskResponse = $taskPending.GetAwaiter().GetResult()
        if ($Method -eq 'GET' -and [int]$taskResponse.StatusCode -in @(301,302,303,307,308) -and $taskResponse.Headers.Location) {
            if ($Hops -ge 5) { $taskResponse.Dispose(); throw 'Too many download redirects.' }
            $taskNext = [Uri]::new($taskUri, $taskResponse.Headers.Location)
            $taskNextAuth = $UseAuth -and $taskNext.Authority -eq $taskUri.Authority
            $taskResponse.Dispose()
            return Send-Dav -Method 'GET' -Name $Name -DirectUrl $taskNext -UseAuth $taskNextAuth -Hops ($Hops + 1)
        }
        if (-not $taskResponse.IsSuccessStatusCode) {
            $taskStatus = [int]$taskResponse.StatusCode
            $taskDetail = ''
            try {
                $taskErrorBody = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                if ($taskErrorBody.Length -le 8192) {
                    try { [xml]$taskErrorXml = $taskErrorBody; $taskDetail = $taskErrorXml.InnerText }
                    catch { $taskDetail = $taskErrorBody -replace '<[^>]+>', ' ' }
                    $taskDetail = ($taskDetail -replace '\s+', ' ').Trim()
                    if ($taskDetail.Length -gt 500) { $taskDetail = $taskDetail.Substring(0, 500) }
                }
            } finally { $taskResponse.Dispose() }
            throw ('WebDAV HTTP ' + $taskStatus + ' for ' + $Name + $(if ($taskDetail) { ': ' + $taskDetail } else { '' }))
        }
        return $taskResponse
    } finally { $taskRequest.Dispose() }
}
function Get-RemoteHash([string]$Name) {
    $taskResponse = Send-Dav 'GET' $Name
    try {
        $taskStream = $taskResponse.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $taskHasher = [Security.Cryptography.SHA256]::Create()
        try { return [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-','').ToLowerInvariant() }
        finally { $taskHasher.Dispose(); $taskStream.Dispose() }
    } finally { $taskResponse.Dispose() }
}
try {
    if ($Action -eq 'Inspect') {
        $taskResponse = Send-Dav 'PROPFIND' ''
        try {
            [xml]$taskXml = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $taskXml.SelectNodes('//*[local-name()="response"]') | ForEach-Object { [PSCustomObject]@{ Path = [Uri]::UnescapeDataString($_.SelectSingleNode('*[local-name()="href"]').InnerText); Size = $_.SelectSingleNode('.//*[local-name()="getcontentlength"]').InnerText } } | ConvertTo-Json
        } finally { $taskResponse.Dispose() }
    } elseif ($Action -eq 'InspectQuota') {
        $taskQuotaXml = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:quota-available-bytes/><d:quota-used-bytes/></d:prop></d:propfind>'
        $taskContent = [Net.Http.StringContent]::new($taskQuotaXml, [Text.Encoding]::UTF8, 'application/xml')
        try { $taskResponse = Send-Dav 'PROPFIND' '' $taskContent }
        finally { $taskContent.Dispose() }
        try {
            [xml]$taskXml = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $taskRootResponse = $taskXml.SelectSingleNode('//*[local-name()="response"]')
            [PSCustomObject]@{
                AvailableBytes = $taskRootResponse.SelectSingleNode('.//*[local-name()="quota-available-bytes"]').InnerText
                UsedBytes = $taskRootResponse.SelectSingleNode('.//*[local-name()="quota-used-bytes"]').InnerText
                Status = @($taskRootResponse.SelectNodes('.//*[local-name()="status"]') | ForEach-Object { $_.InnerText })
            } | ConvertTo-Json
        } finally { $taskResponse.Dispose() }
    } elseif ($Action -eq 'DeleteAssets') {
        if (-not $AssetNames.Count) { throw 'DeleteAssets requires explicit file names.' }
        $taskResponse = Send-Dav 'GET' 'version.json'
        try { $taskCurrent = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json }
        finally { $taskResponse.Dispose() }
        if ($taskCurrent.schemaVersion -ne 1 -or -not $taskCurrent.platforms) { throw 'Cannot validate live manifest references.' }
        $taskReferenced = @('version.json')
        foreach ($taskPlatform in $taskCurrent.platforms.PSObject.Properties) {
            $taskReferenced += $taskPlatform.Value.file
            $taskReferenced += @($taskPlatform.Value.chunks | ForEach-Object { $_.file })
        }
        foreach ($taskName in $AssetNames) {
            if ($taskName -notmatch '^LocalVideo-[A-Za-z0-9._-]+\.(exe|apk|zip|part[0-9]{3}|sha256|blockmap)$') { throw ('Refusing non-release asset: ' + $taskName) }
            if ($taskName -in $taskReferenced) { throw ('Refusing to delete an asset referenced by version.json: ' + $taskName) }
        }
        foreach ($taskName in ($AssetNames | Select-Object -Unique)) {
            $taskResponse = Send-Dav 'DELETE' $taskName
            $taskResponse.Dispose()
            Write-Output ('Deleted cloud asset: ' + $taskName)
        }
    } elseif ($Action -eq 'ReadVersion') {
        $taskResponse = Send-Dav 'GET' 'version.json'
        try { $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() } finally { $taskResponse.Dispose() }
    } else {
        if (-not $Manifest -or -not $PackageDirectory) { throw 'Publish requires -Manifest and -PackageDirectory.' }
        $taskDocument = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
        if ($taskDocument.schemaVersion -ne 1 -or -not $taskDocument.platforms) { throw 'Invalid version manifest.' }
        $taskDirectory = (Resolve-Path -LiteralPath $PackageDirectory).Path
        foreach ($taskPlatform in $taskDocument.platforms.PSObject.Properties) {
            if ($taskPlatform.Name -notin $Platforms) { continue }
            $taskRelease = $taskPlatform.Value
            if ($taskRelease.file -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.(exe|apk)$' -or $taskRelease.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid release file or checksum.' }
            $taskFile = Join-Path $taskDirectory $taskRelease.file
            $taskInfo = Get-Item -LiteralPath $taskFile
            if ($taskInfo.Length -ne $taskRelease.size -or (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskRelease.sha256.ToLowerInvariant()) { throw ('Local package verification failed: ' + $taskRelease.file) }
            $taskAssets = if ($taskRelease.chunks) { @($taskRelease.chunks) } else { @($taskRelease) }
            if ($taskRelease.chunks -and (($taskAssets | Measure-Object -Property size -Sum).Sum -ne $taskRelease.size)) { throw 'Invalid chunk sizes.' }
            foreach ($taskAsset in $taskAssets) {
                if ($taskAsset.file -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.(exe|apk|part[0-9]{3})$' -or $taskAsset.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid upload asset.' }
                $taskAssetFile = Join-Path $taskDirectory $taskAsset.file
                $taskAssetInfo = Get-Item -LiteralPath $taskAssetFile
                if ($taskAssetInfo.Length -ne $taskAsset.size -or (Get-FileHash -LiteralPath $taskAssetFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskAsset.sha256.ToLowerInvariant()) { throw 'Local asset hash mismatch.' }
                $taskExisting = $false
                try {
                    $taskExisting = (Get-RemoteHash $taskAsset.file) -eq $taskAsset.sha256.ToLowerInvariant()
                } catch { $taskExisting = $false }
                if ($taskExisting) { Write-Output ('Already verified: ' + $taskAsset.file); continue }
                Write-Output ('Uploading asset: ' + $taskAsset.file + ' (' + $taskAssetInfo.Length + ' bytes)')
                $taskStream = [IO.File]::OpenRead($taskAssetFile)
                $taskContent = [Net.Http.StreamContent]::new($taskStream); $taskContent.Headers.ContentLength = $taskAssetInfo.Length
                try { $taskResponse = Send-Dav 'PUT' $taskAsset.file $taskContent; $taskResponse.Dispose() }
                finally { $taskContent.Dispose(); $taskStream.Dispose() }
                if ((Get-RemoteHash $taskAsset.file) -ne $taskAsset.sha256.ToLowerInvariant()) { throw 'Cloud asset SHA-256 mismatch; version.json was not published.' }
                Write-Output ('Verified cloud asset: ' + $taskAsset.file)
            }
        }
        if ($PackagesOnly) { Write-Output 'Packages uploaded and verified; version.json was not changed.'; return }
        # Partial publication must preserve the other platform exactly as it exists online.
        if ($Platforms.Count -lt 2) {
            $taskResponse = Send-Dav 'GET' 'version.json'
            try { $taskCurrent = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json }
            finally { $taskResponse.Dispose() }
            foreach ($taskName in @('windows','android')) {
                if ($taskName -in $Platforms) { continue }
                if (($taskDocument.platforms.$taskName | ConvertTo-Json -Depth 12 -Compress) -ne ($taskCurrent.platforms.$taskName | ConvertTo-Json -Depth 12 -Compress)) { throw ('Unselected platform changed; refusing to overwrite ' + $taskName) }
            }
        }
        # Publish the small manifest last, after every package is complete and verified.
        $taskJson = $taskDocument | ConvertTo-Json -Depth 12
        $taskContent = [Net.Http.StringContent]::new($taskJson, [Text.Encoding]::UTF8, 'application/json')
        $taskResponse = Send-Dav 'PUT' 'version.json' $taskContent; $taskResponse.Dispose()
        $taskResponse = Send-Dav 'GET' 'version.json'
        try { $taskActual = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json; if (($taskActual|ConvertTo-Json -Depth 12 -Compress) -ne ($taskDocument|ConvertTo-Json -Depth 12 -Compress)) { throw 'Manifest read-back mismatch.' } }
        finally { $taskResponse.Dispose() }
        Write-Output 'Published and read back version.json successfully.'
    }
} finally { $taskHttp.Dispose(); $taskHandler.Dispose(); $taskPlain = $null; $taskAuthorization = $null }
