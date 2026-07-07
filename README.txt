Poste de supervision Flask - commande biogaz
==============================================

Lancement :
    pip install flask --break-system-packages   (si necessaire)
    cd webapp
    python3 app.py

Puis ouvrir http://127.0.0.1:5000 dans un navigateur.

Il n'y a qu'un seul dossier "biogaz/" dans tout le projet (a la racine,
a cote de main.py). app.py ajoute automatiquement ce dossier racine a
son chemin de recherche Python, donc aucune copie du module n'est
necessaire ici.
