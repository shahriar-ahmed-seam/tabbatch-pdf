# Builds a Chrome Web Store-ready zip containing only the runtime files.
# Usage:  powershell -ExecutionPolicy Bypass -File store_assets\package.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$include = @('manifest.json', 'icons', 'lib', 'src')
$out = Join-Path $root 'tabbatch-pdf.zip'
if (Test-Path $out) { Remove-Item $out }

Compress-Archive -Path $include -DestinationPath $out -CompressionLevel Optimal
$size = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Output "Created $out ($size KB)"
