// =============================================================================
// Poste de supervision - logique cote client
// Interroge /api/etat toutes les 400ms et met a jour le DOM.
// =============================================================================

const historiqueFreq = [];
const MAX_HISTORIQUE = 40;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pct(value, lo, hi) {
  return clamp(((value - lo) / (hi - lo)) * 100, 0, 100);
}

function setJauge(prefixe, value, lo, hi, options = {}) {
  const { unite = "", decimales = 1, alarmLo, alarmHi } = options;
  const hors = (alarmLo !== undefined && value < alarmLo) || (alarmHi !== undefined && value > alarmHi);
  const elVal = document.getElementById("v-" + prefixe);
  const elBar = document.getElementById("b-" + prefixe);
  if (elVal) {
    elVal.textContent = value.toFixed(decimales) + (unite ? " " + unite : "");
    elVal.classList.toggle("val-alarme", hors);
  }
  if (elBar) {
    elBar.style.width = pct(value, lo, hi) + "%";
    elBar.classList.toggle("remplissage-alarme", hors);
  }
}

function setPastille(id, actif, alarme = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("pastille-actif", "pastille-alarme");
  if (alarme) el.classList.add("pastille-alarme");
  else if (actif) el.classList.add("pastille-actif");
}

function dessinerSchema(etat) {
  const items = [
    { label: "Digesteur", actif: true },
    { label: "Filtres", actif: true },
    { label: "Analyseur", actif: true },
    { label: etat.ev3_position === "STOCKAGE" ? "Vers cuve" : "Evacuation",
      actif: etat.ev3_position === "STOCKAGE", alarme: etat.ev3_position !== "STOCKAGE" },
    { label: "Cuve tampon", actif: true },
    { label: "Surpresseur", actif: etat.surpresseur },
    { label: "Detendeur", actif: etat.surpresseur },
    { label: "Moteur (M)", actif: etat.groupe.marche },
  ];
  const conteneur = document.getElementById("schema");
  conteneur.innerHTML = "";
  items.forEach((it, i) => {
    const item = document.createElement("div");
    item.className = "schema-item";
    const boite = document.createElement("div");
    boite.className = "schema-boite" + (it.alarme ? " boite-alarme" : it.actif ? " boite-actif" : "");
    boite.textContent = it.label;
    item.appendChild(boite);
    if (i < items.length - 1) {
      const lien = document.createElement("div");
      lien.className = "schema-lien" + (it.actif ? " lien-actif" : "");
      item.appendChild(lien);
    }
    conteneur.appendChild(item);
  });
}

function dessinerChart() {
  const canvas = document.getElementById("chartFreq");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (historiqueFreq.length < 2) return;

  const lo = 42, hi = 58;
  ctx.strokeStyle = "#4FC3B0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  historiqueFreq.forEach((val, i) => {
    const x = (i / (MAX_HISTORIQUE - 1)) * w;
    const y = h - ((clamp(val, lo, hi) - lo) / (hi - lo)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ligne de consigne (50 Hz)
  const yConsigne = h - ((50 - lo) / (hi - lo)) * h;
  ctx.strokeStyle = "#3A4249";
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(0, yConsigne);
  ctx.lineTo(w, yConsigne);
  ctx.stroke();
  ctx.setLineDash([]);
}

function mettreAJourJournal(entrees) {
  const conteneur = document.getElementById("journal");
  if (entrees.length === 0) {
    conteneur.innerHTML = '<div class="journal-msg">Aucun evenement pour l\'instant.</div>';
    return;
  }
  conteneur.innerHTML = entrees.map((e) => `
    <div class="journal-ligne ${e.niveau}">
      <span class="journal-heure">${e.heure}</span>
      <span class="journal-msg">${e.message}</span>
    </div>
  `).join("");
}

async function rafraichir() {
  try {
    const reponse = await fetch("/api/etat");
    const etat = await reponse.json();
    const s = etat.seuils;

    // Statut general
    const pill = document.getElementById("statutPill");
    const enDefaut = etat.etat_systeme === "DEFAUT";
    pill.textContent = enDefaut ? "DEFAUT" : (etat.marche ? "EN MARCHE" : "ARRET");
    pill.className = "statut-pill " + (enDefaut ? "statut-alarme" : "statut-ok");
    document.getElementById("cycleVal").textContent = etat.cycle;

    // Digesteur
    setJauge("temp", etat.digesteur.temperature, 30, 45, { unite: "degC", alarmLo: s.temp_min, alarmHi: s.temp_max });
    setJauge("niveau", etat.digesteur.niveau, 0, 100, { unite: "%", decimales: 0, alarmLo: s.niveau_dig_min, alarmHi: s.niveau_dig_max });
    setJauge("ph", etat.digesteur.ph, 5, 9, { decimales: 2, alarmLo: s.ph_min, alarmHi: s.ph_max });

    // Filtres
    setJauge("fEau", etat.filtres.eau, 0, 60, { unite: "mbar", alarmHi: s.delta_p_max });
    setJauge("fH2s", etat.filtres.h2s, 0, 60, { unite: "mbar", alarmHi: s.delta_p_max });
    setJauge("fPous", etat.filtres.poussiere, 0, 60, { unite: "mbar", alarmHi: s.delta_p_max });

    // Analyseur
    setJauge("ch4", etat.analyseur.ch4, 0, 100, { unite: "%", alarmLo: s.ch4_min });
    setJauge("co2", etat.analyseur.co2, 0, 100, { unite: "%", alarmHi: s.co2_max });
    setJauge("h2s", etat.analyseur.h2s, 0, 300, { unite: "ppm", decimales: 0, alarmHi: s.h2s_max });
    setPastille("p-ev3", etat.ev3_position === "STOCKAGE", etat.ev3_position !== "STOCKAGE");
    document.getElementById("l-ev3").textContent = etat.ev3_position === "STOCKAGE"
      ? "Gaz conforme -> stockage" : "Gaz non conforme -> evacuation";

    // Cuve + sequence
    setJauge("cuve", etat.cuve, 0, 100, { unite: "%", decimales: 0 });
    document.getElementById("v-sequence").textContent = "Sequence : " + etat.sequence.replaceAll("_", " ");
    setPastille("p-ev", etat.ev_surpresseur);
    setPastille("p-surpresseur", etat.surpresseur);

    // Groupe electrogene
    document.getElementById("v-freq").textContent = etat.groupe.frequence.toFixed(2);
    setJauge("tension", etat.groupe.tension, 0, 260, { unite: "V", decimales: 0 });
    setJauge("ouverture", etat.groupe.ouverture, 0, 100, { unite: "%", decimales: 0 });
    setJauge("charge", etat.charge_foyer, 0, 5, { unite: "kW", decimales: 2 });
    setPastille("p-groupe", etat.groupe.marche);

    historiqueFreq.push(etat.groupe.frequence);
    if (historiqueFreq.length > MAX_HISTORIQUE) historiqueFreq.shift();
    dessinerChart();

    dessinerSchema(etat);
    mettreAJourJournal(etat.journal);

    // Etat des boutons de perturbation
    document.getElementById("btnDefautDig").classList.toggle("actif-btn", etat.digesteur.defaut_force);
    document.getElementById("btnGazNC").classList.toggle("actif-btn", etat.analyseur.force);
    document.getElementById("btnMarche").textContent = etat.marche ? "Mettre en pause" : "Reprendre";
  } catch (err) {
    console.error("Erreur lors du rafraichissement :", err);
  }
}

async function appelerApi(chemin) {
  await fetch(chemin, { method: "POST" });
  rafraichir();
}

document.getElementById("btnMarche").addEventListener("click", () => appelerApi("/api/marche_arret"));
document.getElementById("btnDefautDig").addEventListener("click", () => appelerApi("/api/defaut_digesteur"));
document.getElementById("btnGazNC").addEventListener("click", () => appelerApi("/api/gaz_non_conforme"));
document.getElementById("btnReset").addEventListener("click", () => {
  historiqueFreq.length = 0;
  appelerApi("/api/reinitialiser");
});

rafraichir();
setInterval(rafraichir, 400);
