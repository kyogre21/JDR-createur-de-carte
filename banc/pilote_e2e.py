# Pilote du banc de bout en bout : un Chrome MJ + un Chrome joueur (largeur
# mobile), reliés uniquement par la vraie base Firebase. Les pages banc
# rapportent leur progression dans document.title, lu par l'API DevTools.
import json
import subprocess
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "http://127.0.0.1:8788"
SCRATCH = r"C:\Users\boujoj\AppData\Local\Temp\claude\C--Projet-jdr\d7d941f8-cd65-4a8b-babb-e1deba59c57a\scratchpad"
CODE = str(1000 + int(time.time()) % 9000)

serveur = subprocess.Popen(
    [sys.executable, "-m", "http.server", "8788", "--bind", "127.0.0.1"],
    cwd=r"C:\Projet\jdr créateur de carte",
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def chrome(port, profil, taille, url):
    return subprocess.Popen([
        CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
        "--remote-debugging-port=" + str(port),
        "--user-data-dir=" + SCRATCH + "\\" + profil,
        "--window-size=" + taille, url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def titre(port):
    try:
        with urllib.request.urlopen(
                "http://127.0.0.1:%d/json" % port, timeout=3) as r:
            for p in json.load(r):
                if p.get("type") == "page" and "banc" in p.get("url", ""):
                    return p.get("title", "")
    except Exception:
        pass
    return ""


try:
    print("code de session force :", CODE)
    mj = chrome(9333, "profil-mj", "1000,700",
                BASE + "/banc/banc-e2e-mj.html?code=" + CODE)
    # attendre que la session MJ soit ouverte
    for _ in range(60):
        t = titre(9333)
        if "code=" in t:
            print("MJ pret  :", t)
            break
        time.sleep(1)
    else:
        print("MJ jamais pret :", titre(9333)); raise SystemExit(1)

    jo = chrome(9334, "profil-joueur", "500,900",
                BASE + "/banc/banc-e2e-joueur.html?session=" + CODE)
    for i in range(120):
        tj, tm = titre(9334), titre(9333)
        if i % 5 == 0 or "PASSE" in tj or "REPRISE" in tm or "timeout" in tj:
            print("t=%3ds  MJ %s\n        J  %s" % (i, tm, tj))
        # succès complet : traversée joueur ET reprise + bibliothèque prouvées
        if ("REPRISE" in tm and "PASSE" in tj) or "timeout" in tj or "timeout" in tm \
                or "erreur" in tj or "ERREUR" in tm:
            break
        time.sleep(1)
    print("\n=== RESULTAT ===")
    print("MJ     :", titre(9333))
    print("Joueur :", titre(9334))
finally:
    for p in ("mj", "jo"):
        try:
            locals()[p].kill()
        except Exception:
            pass
    serveur.kill()
