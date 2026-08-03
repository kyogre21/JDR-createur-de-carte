@echo off
chcp 65001 >nul
title Publier Cartographe Knight sur le site
cd /d "%~dp0"

echo.
echo   ================================================
echo     PUBLIER SUR LE SITE
echo   ================================================
echo.
echo   1. Sauvegarde tes modifications sur GitHub (historique)
echo   2. Met le site a jour sur Firebase Hosting (gratuit,
echo      sans credits de build : l'envoi part de ce PC)
echo.

rem ---- 1. sauvegarde git (gratuite, jamais bloquante) ----
git status --short | findstr /r "." >nul
if errorlevel 1 (
  echo   Aucune modification locale : rien a sauvegarder sur GitHub.
) else (
  echo   Modifications detectees :
  git status --short
  echo.
  set MSG=
  set /p MSG=Description courte (Entree = "Mise a jour des cartes") :
  if "%MSG%"=="" set MSG=Mise a jour des cartes
  git add -A
  git commit -m "%MSG%"
  git push
  if errorlevel 1 (
    echo.
    echo   [!] L'envoi vers GitHub a echoue ^(reseau ?^). La publication du
    echo       site continue quand meme ; relance plus tard pour l'historique.
  )
)

echo.
echo   Envoi du site vers Firebase Hosting...
firebase deploy --only hosting --project creation-de-carte-jdr
if errorlevel 1 (
  echo.
  echo   [!] Le deploiement a echoue. Causes frequentes :
  echo       - pas de reseau
  echo       - session Firebase expiree : lance  firebase login  dans un terminal
  pause
  exit /b 1
)

echo.
echo   Publie ! Le site est a jour :
echo   https://creation-de-carte-jdr.web.app
echo.
pause
