# ============================================================
#  Génère des VIGNETTES (160 px, JPEG) pour les images du site.
#  Pourquoi : les palettes affichent des carrés de 26 px, mais chargeaient les
#  fichiers d'origine — un dossier de 13 PNG de 2-3 Mo faisait télécharger 30 Mo
#  et décoder ~78 Mo en mémoire (plantage d'onglet sur téléphone).
#  Les vignettes tombent à ~8 Ko pièce.
#
#  Lancé automatiquement par « Publier sur le site.bat ».
#  Manuellement :  powershell -ExecutionPolicy Bypass -File generer-vignettes.ps1
# ============================================================
Add-Type -AssemblyName System.Drawing

$racine = Join-Path $PSScriptRoot 'images'
$sortie = Join-Path $racine 'vignettes'
$COTE = 160
$exts = @('.png', '.jpg', '.jpeg', '.webp', '.gif')

if (-not (Test-Path $racine)) { Write-Host "  Aucun dossier images/ - rien a faire."; exit 0 }
if (-not (Test-Path $sortie)) { New-Item -ItemType Directory -Force $sortie | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]70)

$faites = 0; $ignorees = 0; $echecs = 0

Get-ChildItem $racine -Recurse -File | Where-Object {
  $exts -contains $_.Extension.ToLower() -and $_.FullName -notlike "$sortie*"
} | ForEach-Object {
  $rel = $_.FullName.Substring($racine.Length + 1)
  $cible = Join-Path $sortie ($rel -replace '\.[^.\\]+$', '.jpg')
  $dossierCible = Split-Path $cible -Parent
  if (-not (Test-Path $dossierCible)) { New-Item -ItemType Directory -Force $dossierCible | Out-Null }

  # déjà à jour ? on ne refait pas le travail (publication rapide)
  if ((Test-Path $cible) -and ((Get-Item $cible).LastWriteTime -ge $_.LastWriteTime)) {
    $ignorees++
    return
  }
  try {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    [double]$ratio = $COTE / [double][Math]::Max($img.Width, $img.Height)
    if ($ratio -gt 1) { $ratio = 1.0 }
    $w = [Math]::Max(1, [int][Math]::Round($img.Width * $ratio))
    $h = [Math]::Max(1, [int][Math]::Round($img.Height * $ratio))
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gfx.Clear([System.Drawing.Color]::Black)
    $gfx.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save($cible, $codec, $ep)
    $gfx.Dispose(); $bmp.Dispose(); $img.Dispose()
    $faites++
  } catch {
    Write-Host "  [!] Vignette impossible : $rel"
    $echecs++
  }
}

Write-Host "  Vignettes : $faites generee(s), $ignorees deja a jour$(if ($echecs) { ", $echecs echec(s)" })."
