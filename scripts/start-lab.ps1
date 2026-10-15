param([int]$Port = 5173, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskUrl = "http://127.0.0.1:$Port/"
function Test-LabReady {
    try { $taskResponse = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 1; return ($taskResponse.StatusCode -eq 200 -and $taskResponse.Content -match 'function-laboratory') } catch { return $false }
}
if (-not (Test-LabReady)) {
    $taskNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $taskNode) { throw '未找到 Node.js。请安装 Node.js 22 或更高版本后重试。' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'node_modules/vite/bin/vite.js'))) { throw '项目依赖未安装。请在项目目录运行 npm install 后重试。' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist/index.html'))) {
        Push-Location $taskRoot
        try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw '构建失败，请查看上方提示。' } } finally { Pop-Location }
    }
    $taskRuntime = Join-Path $taskRoot '.runtime'
    New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
    $taskVite = Join-Path $taskRoot 'node_modules/vite/bin/vite.js'
    $taskArgs = @('"' + $taskVite + '"', 'preview', '--host', '127.0.0.1', '--port', "$Port", '--strictPort')
    $taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArgs -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime "server-$Port.log") -RedirectStandardError (Join-Path $taskRuntime "server-$Port.error.log")
    Set-Content -LiteralPath (Join-Path $taskRuntime "server-$Port.pid") -Value $taskProcess.Id
    $taskReady = $false
    for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) { if (Test-LabReady) { $taskReady = $true; break }; if ($taskProcess.HasExited) { break }; Start-Sleep -Milliseconds 250 }
    if (-not $taskReady) { throw "本地服务未启动。请查看 .runtime/server-$Port.error.log；端口 $Port 可能被其他应用占用。" }
}
Write-Host "函数实验室已就绪：$taskUrl"
if (-not $NoBrowser) { Start-Process $taskUrl }
