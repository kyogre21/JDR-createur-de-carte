"""Fabrique l'archive à déposer sur Netlify Drop ou Cloudflare Pages.

La racine de l'archive est le CONTENU de plateforme/ : index.html doit s'y
trouver directement, sinon l'hébergeur ne trouve pas la page d'accueil.

    python creer-archive.py
"""
import os
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(ICI, "plateforme")
ARCHIVE = os.path.join(ICI, "cartographe-knight-a-deposer.zip")

if not os.path.isdir(SOURCE):
    sys.exit("Dossier introuvable : " + SOURCE)

n = 0
with zipfile.ZipFile(ARCHIVE, "w", zipfile.ZIP_DEFLATED) as z:
    for racine, _, fichiers in os.walk(SOURCE):
        for f in fichiers:
            chemin = os.path.join(racine, f)
            interne = os.path.relpath(chemin, SOURCE).replace(os.sep, "/")
            z.write(chemin, interne)
            n += 1

print("Archive : %s" % ARCHIVE)
print("%d fichiers, %d Ko" % (n, os.path.getsize(ARCHIVE) // 1024))
print("À déposer sur https://app.netlify.com/drop")
