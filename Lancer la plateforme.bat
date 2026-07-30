@echo off
chcp 65001 >nul
title Cartographe Knight - serveur local (garder cette fenetre ouverte)
cd /d "%~dp0plateforme"

rem  Adresse IP de ce PC sur le reseau local (interface qui a une passerelle).
set IP=
for /f "delims=" %%i in ('powershell -NoProfile -Command ^
  "(Get-NetIPConfiguration ^| Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } ^| Select-Object -First 1).IPv4Address.IPAddress"') do set IP=%%i

cls
echo.
echo   ================================================
echo     CARTOGRAPHE KNIGHT
echo   ================================================
echo.
echo   SUR CET ORDINATEUR
echo     Bibliotheque ... http://127.0.0.1:8777/
echo     Table de jeu ... http://127.0.0.1:8777/table.html
echo     Vue joueurs .... http://127.0.0.1:8777/table.html?vue=joueurs
echo.
if defined IP (
  echo   SUR TON TELEPHONE ou TA TABLETTE  ^(meme Wi-Fi que ce PC^)
  echo     Tape cette adresse dans le navigateur :
  echo.
  echo         http://%IP%:8777/
  echo.
) else (
  echo   [!] Adresse reseau introuvable : verifie que le Wi-Fi est connecte.
  echo.
)
echo   GARDE CETTE FENETRE OUVERTE pendant que tu joues.
echo   Ferme-la pour arreter le serveur.
echo.
echo   Au premier lancement, Windows peut demander d'autoriser Python
echo   sur le reseau : accepte pour les reseaux prives.
echo.

rem  Ouvre le navigateur deux secondes plus tard, le temps que le serveur demarre.
start "" cmd /c "timeout /t 2 /nobreak >nul && explorer http://127.0.0.1:8777/index.html"

rem  0.0.0.0 : le serveur accepte aussi les appareils du reseau local (le telephone).
python -m http.server 8777 --bind 0.0.0.0 2>nul
if errorlevel 1 (
  py -3 -m http.server 8777 --bind 0.0.0.0 2>nul
)
if errorlevel 1 (
  echo.
  echo   [!] Python n'a pas ete trouve.
  echo       Installe-le depuis https://www.python.org/downloads/
  echo       en cochant "Add python.exe to PATH", puis relance ce fichier.
  echo.
  pause
)
