@echo off
chcp 65001 >nul
title Publier Cartographe Knight sur le site
cd /d "%~dp0"

echo.
echo   ================================================
echo     PUBLIER SUR LE SITE
echo   ================================================
echo.
echo   Envoie tes cartes et modifications vers GitHub ;
echo   Netlify met le site a jour tout seul derriere
echo   (compter environ une minute).
echo.

rem  Rien a publier ? Le dire au lieu de creer un commit vide.
git diff --quiet && git diff --cached --quiet
if not errorlevel 1 (
  git status --short | findstr /r "." >nul
  if errorlevel 1 (
    echo   Rien de nouveau a publier : le site est deja a jour.
    echo.
    pause
    exit /b 0
  )
)

echo   Modifications detectees :
git status --short
echo.

set MSG=
set /p MSG=Description courte (Entree = "Mise a jour des cartes") :
if "%MSG%"=="" set MSG=Mise a jour des cartes

git add -A
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo   [!] L'enregistrement local a echoue. Verifie le message ci-dessus.
  pause
  exit /b 1
)

git push
if errorlevel 1 (
  echo.
  echo   [!] L'envoi vers GitHub a echoue ^(reseau ? identifiants ?^).
  echo       Tes modifications restent enregistrees en local :
  echo       relance simplement ce fichier plus tard.
  pause
  exit /b 1
)

echo.
echo   Publie. Le site sera a jour dans environ une minute.
echo.
pause
