chcp 65001 > $null
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
Set-Location "D:\claude\cwd"
cd D:\claude\fold; git add .; git commit -m "v0.4.1更新"; git push
Write-Host "__EX_DONE_mpxa8oqr__"
