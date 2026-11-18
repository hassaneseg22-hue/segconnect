/* =====================================================================
   SEGE — pilotage de la carte nationale (Tableau de bord)
   « montre Kankan sur la carte », « affiche la région de Labé »,
   « zoome », « dézoome », « recentre la carte », « montre les incidents »
   ===================================================================== */

export type CommandeCarte = { action: 'zoom-in' | 'zoom-out' | 'reset' | 'conakry' | 'plein-ecran' | 'filtre' | 'centres' | 'region' | 'lieu'; cible?: string; type?: string; essai?: number };
export type ResultatCarte = { ok: boolean; libelle?: string; statut?: string; region?: string; nombre?: number };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'\-_]/g, ' ').replace(/[?!.,;:«»"]/g, ' ').replace(/\s+/g, ' ').trim();

const REGIONS: [RegExp, string][] = [
  [/\bboke\b/, 'Boké'], [/\bconakry\b/, 'Conakry'], [/\bfaranah\b/, 'Faranah'], [/\bkankan\b/, 'Kankan'],
  [/\bkindia\b/, 'Kindia'], [/\blabe\b/, 'Labé'], [/\bmamou\b/, 'Mamou'], [/\bn ?zerekore\b/, "N'Zérékoré"],
];

export function commandeCarte(texte: string): CommandeCarte | null {
  const q = norm(texte).replace(/^(sege|serge|seje)\s*/, '');
  const surCarte = /\bcarte\b/.test(q) || /\b(montre|affiche|selectionne)\b.*\bregion (de|du|d)\b/.test(q);
  const verbeCarte = /\b(zoom|zoome|zoomer|dezoom|dezoome|dezoomer|localise|localiser|situe|situer|ou se trouve|ou est situe|recentre|recentrer|plein ecran)\b/.test(q);
  if (!surCarte && !verbeCarte) return null;

  if (/plein ecran/.test(q)) return { action: 'plein-ecran' };
  if (/\b(recentre|recentrer|reinitialise|vue d ensemble|toute la guinee|carte entiere|tout le pays|carte complete)\b/.test(q)) return { action: 'reset' };
  if (/\b(dezoom|dezoome|dezoomer|zoom arriere|eloigne|elargis)\b/.test(q)) return { action: 'zoom-out' };
  if (/grand conakry/.test(q) && !/region/.test(q)) return { action: 'conakry' };

  // Filtres d'infrastructures
  const filtre = (t: string) => ({ action: 'filtre' as const, type: t });
  if (/\b(montre|affiche|filtre|garde|seulement|uniquement|que les)\b/.test(q) || surCarte) {
    if (/centres? (en difficulte|a l arret|en arret|perturbes?)/.test(q)) return { action: 'centres' };
    if (/\b(incidents?|arrets? declares?|pannes?)\b/.test(q)) return filtre('incident');
    if (/\b(stations?|sites? de production|usines?|pompage)\b/.test(q) && !/\bstation (de|du) [a-z]/.test(q)) return filtre('pompage');
    if (/\breservoirs?\b/.test(q) && !/reservoir [a-z]{4,}/.test(q.replace(/reservoirs? (de|du|des) conakry/, ''))) return filtre('reservoir');
    if (/\bdirections? regionales?\b/.test(q)) return filtre('direction');
    if (/\bmissions?\b/.test(q)) return filtre('mission');
    if (/\b(les agences|agences et centres|toutes les agences)\b/.test(q)) return filtre('agence');
    if (/\b(toutes? les infrastructures|tout afficher|tous les points|enleve le filtre|retire le filtre)\b/.test(q)) return filtre('all');
  }

  // Région
  if (/\bregion\b/.test(q)) {
    for (const [re, nom] of REGIONS) if (re.test(q)) return { action: 'region', cible: nom };
  }

  // Un lieu précis : « montre Kankan », « localise la station de Kakimbo », « zoome sur Siguiri »
  const m = q.match(/\b(?:montre|montrez|affiche|affichez|localise|situe|selectionne|zoome sur|zoom sur|zoomer sur|va sur|centre sur|ou se trouve|ou est situe|ou est)\s+(?:moi\s+)?(?:le |la |l |les )?(?:centre (?:de |d )?|station (?:de |d |du )?|agence (?:de |d )?|site (?:de |d )?|ville (?:de |d )?|direction regionale (?:de |d )?|reservoir (?:de |d )?)?(.+?)(?:\s+sur la carte|\s+dans la carte|\s+sur la carte nationale)?$/);
  if (m) {
    const cible = m[1].replace(/\b(sur|dans) la carte.*$/, '').replace(/^(de|du|d)\s+/, '').trim();
    if (cible && !/^(carte|la carte)$/.test(cible)) return { action: 'lieu', cible };
  }
  if (/\b(zoom|zoome|zoomer|rapproche|agrandis)\b/.test(q)) return { action: 'zoom-in' };
  if (surCarte) return { action: 'reset' };
  return null;
}

/* Envoie la commande à la carte (ouvre le Tableau de bord si besoin) et attend son retour */
export function piloterCarte(cmd: CommandeCarte, ouvrir: (href: string) => void): Promise<{ resultat: ResultatCarte | null; ouverte: boolean }> {
  return new Promise((resolve) => {
    const w = window as unknown as { __segeCarte?: boolean };
    const presente = !!w.__segeCarte;
    let fini = false;
    const recu = (e: Event) => {
      if (fini) return; fini = true;
      window.removeEventListener('sege-carte-resultat', recu);
      resolve({ resultat: (e as CustomEvent<ResultatCarte>).detail, ouverte: !presente });
    };
    window.addEventListener('sege-carte-resultat', recu);
    setTimeout(() => { if (!fini) { fini = true; window.removeEventListener('sege-carte-resultat', recu); resolve({ resultat: null, ouverte: !presente }); } }, presente ? 3000 : 12000);
    if (presente) {
      window.dispatchEvent(new CustomEvent('sege-carte', { detail: cmd }));
    } else {
      try { sessionStorage.setItem('sege-carte-cmd', JSON.stringify({ ...cmd, essai: 1 })); } catch { /* ignoré */ }
      ouvrir('/');
    }
  });
}

export function phraseCommande(cmd: CommandeCarte, r: ResultatCarte | null): string {
  const types: Record<string, string> = { incident: 'les incidents et arrêts déclarés', pompage: 'les stations de production', reservoir: 'les réservoirs', direction: 'les directions régionales', mission: 'les missions déclarées', agence: 'les agences et centres', all: 'toutes les infrastructures' };
  switch (cmd.action) {
    case 'zoom-in': return 'Je rapproche la carte.';
    case 'zoom-out': return 'J’éloigne la carte.';
    case 'reset': return 'Voici toute la Guinée.';
    case 'conakry': return 'Voici le Grand Conakry.';
    case 'plein-ecran': return 'J’affiche la carte en plein écran.';
    case 'filtre': return `La carte n’affiche plus que ${types[cmd.type || 'all'] ?? 'la sélection'}.`;
    case 'centres': return r?.nombre ? `Voici les ${r.nombre} centres de l’intérieur en difficulté, en rouge à l’arrêt et en orange perturbés.` : 'J’affiche les centres de l’intérieur en difficulté.';
    case 'region': return r?.ok ? `Voici la ${r.libelle ?? `région de ${cmd.cible}`}${r.statut ? ` : ${r.statut}` : ''}.` : `Je ne trouve pas la région « ${cmd.cible} ».`;
    case 'lieu': return r?.ok ? `Voici ${r.libelle}${r.region ? `, région de ${r.region}` : ''}.${r.statut ? ` ${r.statut}.` : ''}` : r ? `Je ne trouve pas « ${cmd.cible} » sur la carte.` : `Je vous montre « ${cmd.cible} » sur la carte.`;
  }
}
