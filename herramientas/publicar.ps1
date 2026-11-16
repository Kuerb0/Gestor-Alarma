# Publica la versión de package.json: construye el instalador, etiqueta, sube y crea la Release de GitHub.
#   .\herramientas\publicar.ps1 [-Notas "texto"] [-Ensayo]      (-Ensayo: solo imprime lo que haría)
param([string]$Notas = '', [switch]$Ensayo)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz
$repo = 'Kuerb0/Gestor-Alarma'
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$v"
if (-not $Notas) { $Notas = "Gestor-Alarma $v" }
$inst = Join-Path $raiz "dist\GestorAlarma $v - Instalador.exe"   # construir.py: dist/<nombre de app.json> <versión> - Instalador.exe

function Paso($t, [scriptblock]$f) { if ($Ensayo) { Write-Host "[ensayo] $t" } else { Write-Host $t; & $f; if ($LASTEXITCODE) { throw "falló: $t" } } }

if (git status --porcelain) { if ($Ensayo) { Write-Host '[ensayo] AVISO: el árbol git no está limpio (la publicación real se negaría)' } else { throw 'El árbol git no está limpio: haz commit antes de publicar.' } }
if (git tag -l $tag) { throw "La etiqueta $tag ya existe: sube la versión en package.json." }

Paso "python C:\Github\herramientas-apps\construir.py exe   (~8 min -> $inst)" { python C:\Github\herramientas-apps\construir.py exe }
if (-not $Ensayo -and -not (Test-Path $inst)) { throw "No encuentro el instalador: $inst" }
Paso "git tag $tag" { git tag $tag }
Paso 'git push' { git push }
Paso 'git push --tags' { git push --tags }
Paso "gh release create $tag `"$inst`" --repo $repo --title `"Gestor-Alarma $v`" --notes `"$Notas`"" { gh release create $tag $inst --repo $repo --title "Gestor-Alarma $v" --notes $Notas }
Write-Host $(if ($Ensayo) { "[ensayo] listo: no se ha hecho nada" } else { "Publicada $tag en https://github.com/$repo/releases" })
