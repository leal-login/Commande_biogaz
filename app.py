"""
Application Flask : poste de supervision web pour la commande biogaz.

Une simulation (biogaz.Superviseur) tourne en arriere-plan dans un thread
Python. La page web interroge periodiquement (toutes les ~400 ms) une API
JSON pour recuperer l'etat courant et redessiner le tableau de bord, sans
recharger la page (technique de "polling").

Lancement :
    pip install flask --break-system-packages   (si necessaire)
    cd webapp
    python3 app.py
    puis ouvrir http://127.0.0.1:5000 dans un navigateur

Le module "biogaz" n'est PAS duplique dans ce dossier : la ligne
sys.path ci-dessous ajoute le dossier parent (racine du projet) au
chemin de recherche Python, pour aller chercher le "biogaz/" qui se
trouve a la racine, a cote de main.py.
"""

import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, render_template, request

from biogaz import Superviseur, Seuils
from biogaz.utils import obtenir_journal, vider_journal

app = Flask(__name__)

etat_partage = {
    "superviseur": Superviseur(),
    "marche": True,
}
verrou = threading.Lock()


def boucle_simulation():
    """Tourne en continu dans un thread separe et fait avancer la
    simulation d'un pas (dt=1s simule) toutes les 0.35s reelles."""
    while True:
        with verrou:
            if etat_partage["marche"]:
                etat_partage["superviseur"].cycle_supervision(dt=1.0)
        time.sleep(0.35)


def demarrer_simulation():
    threading.Thread(target=boucle_simulation, daemon=True).start()


def instantane():
    """Construit un instantane JSON-serialisable de l'etat courant."""
    with verrou:
        s = etat_partage["superviseur"]
        pression_manometre = s.detendeur.lire_manometre(s.surpresseur.en_marche)
        return {
            "cycle": s.cycle,
            "etat_systeme": s.etat.name,
            "marche": etat_partage["marche"],
            "digesteur": {
                "temperature": round(s.digesteur.temperature, 2),
                "niveau": round(s.digesteur.niveau, 2),
                "ph": round(s.digesteur.ph, 2),
                "defaut_force": s.digesteur.perturbation_forcee,
            },
            "filtres": {
                "eau": round(s.filtre_eau.delta_pression, 1),
                "h2s": round(s.filtre_h2s.delta_pression, 1),
                "poussiere": round(s.filtre_poussiere.delta_pression, 1),
            },
            "analyseur": {
                "ch4": round(s.analyseur.ch4, 1),
                "co2": round(s.analyseur.co2, 1),
                "h2s": round(s.analyseur.h2s, 1),
                "conforme": s.analyseur.gaz_conforme(),
                "force": s.analyseur.perturbation_forcee,
            },
            "ev3_position": s.ev3_aiguillage.position,
            "cuve": round(s.cuve_tampon.niveau, 1),
            "sequence": s.sequence.etat.name,
            "ev_surpresseur": s.ev_surpresseur.ouverte,
            "surpresseur": s.surpresseur.en_marche,
            "pression_manometre": round(pression_manometre, 2),
            "groupe": {
                "marche": s.groupe.en_marche,
                "frequence": round(s.groupe.frequence, 2),
                "tension": round(s.groupe.tension, 1),
                "ouverture": round(s.groupe.ouverture_vanne_gaz, 1),
            },
            "charge_foyer": round(s.charge_foyer_kw, 2),
            "seuils": {
                "temp_min": Seuils.TEMP_MIN, "temp_max": Seuils.TEMP_MAX,
                "niveau_dig_min": Seuils.NIVEAU_DIGESTEUR_MIN,
                "niveau_dig_max": Seuils.NIVEAU_DIGESTEUR_MAX,
                "ph_min": Seuils.PH_MIN, "ph_max": Seuils.PH_MAX,
                "ch4_min": Seuils.CH4_MIN, "co2_max": Seuils.CO2_MAX,
                "h2s_max": Seuils.H2S_MAX,
                "delta_p_max": Seuils.DELTA_P_FILTRE_MAX,
                "cuve_max": Seuils.NIVEAU_CUVE_MAX,
                "cuve_consigne": Seuils.NIVEAU_CUVE_CONSIGNE,
                "cuve_min": Seuils.NIVEAU_CUVE_MIN,
                "freq_consigne": Seuils.FREQ_CONSIGNE,
            },
            "journal": obtenir_journal(40),
        }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/etat")
def api_etat():
    return jsonify(instantane())


@app.route("/api/marche_arret", methods=["POST"])
def api_marche_arret():
    with verrou:
        etat_partage["marche"] = not etat_partage["marche"]
        marche = etat_partage["marche"]
    return jsonify({"marche": marche})


@app.route("/api/defaut_digesteur", methods=["POST"])
def api_defaut_digesteur():
    with verrou:
        s = etat_partage["superviseur"]
        s.digesteur.perturbation_forcee = not s.digesteur.perturbation_forcee
        actif = s.digesteur.perturbation_forcee
    return jsonify({"actif": actif})


@app.route("/api/gaz_non_conforme", methods=["POST"])
def api_gaz_non_conforme():
    with verrou:
        s = etat_partage["superviseur"]
        s.analyseur.perturbation_forcee = not s.analyseur.perturbation_forcee
        actif = s.analyseur.perturbation_forcee
    return jsonify({"actif": actif})


@app.route("/api/reinitialiser", methods=["POST"])
def api_reinitialiser():
    with verrou:
        etat_partage["superviseur"] = Superviseur()
        etat_partage["marche"] = True
    vider_journal()
    return jsonify({"ok": True})


if __name__ == "__main__":
    demarrer_simulation()
    app.run(debug=True, use_reloader=False, threaded=True, port=5000)
