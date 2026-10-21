/* =====================================================================
 * Registre des incidents et missions de terrain (seg_evenements_terrain)
 * Constantes partagées entre l'API et les pages. Aucune donnée ici :
 * uniquement les listes de choix proposées dans le formulaire.
 * ===================================================================== */

export type EvenementNature = 'incident' | 'mission';
export type EvenementGravite = 'faible' | 'moyenne' | 'critique';
export type EvenementStatut = 'ouvert' | 'en_cours' | 'resolu' | 'annule';

export type Evenement = {
  id: number;
  nature: EvenementNature;
  categorie: string;
  titre: string;
  description: string | null;
  centre_nom: string | null;
  agency_id: number | null;
  agency_name: string | null;
  installation: string | null;
  latitude: number | null;
  longitude: number | null;
  gravite: EvenementGravite | null;
  statut: EvenementStatut;
  date_debut: string;
  date_fin: string | null;
  equipe: string | null;
  impact_m3: number | null;
  declare_par: string | null;
  declare_par_nom: string | null;
  created_at: string;
  updated_at: string;
};

export const NATURES: EvenementNature[] = ['incident', 'mission'];
export const GRAVITES: EvenementGravite[] = ['faible', 'moyenne', 'critique'];
export const STATUTS: EvenementStatut[] = ['ouvert', 'en_cours', 'resolu', 'annule'];

export const STATUT_LABEL: Record<EvenementStatut, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu',
  annule: 'Annulé',
};

export const GRAVITE_LABEL: Record<EvenementGravite, string> = {
  faible: 'Faible',
  moyenne: 'Moyenne',
  critique: 'Critique',
};

export const CATEGORIES: Record<EvenementNature, string[]> = {
  incident: [
    'Panne électrique',
    'Panne de pompe / équipement',
    'Casse de conduite / fuite majeure',
    'Arrêt de station',
    'Qualité de l’eau',
    'Rupture de produits de traitement',
    'Rupture de carburant',
    'Vandalisme / vol',
    'Autre',
  ],
  mission: [
    'Réparation / dépannage',
    'Maintenance préventive',
    'Inspection / contrôle',
    'Travaux sur le réseau',
    'Contrôle qualité de l’eau',
    'Approvisionnement',
    'Autre',
  ],
};

/** Permission de lecture et d'écriture pour chaque nature. */
export const PERMISSIONS: Record<EvenementNature, { view: string; create: string; update: string }> = {
  incident: { view: 'incidents.view', create: 'incidents.create', update: 'incidents.update' },
  mission: { view: 'missions.view', create: 'missions.create', update: 'missions.update' },
};

export const isNature = (v: unknown): v is EvenementNature => v === 'incident' || v === 'mission';
export const isGravite = (v: unknown): v is EvenementGravite => v === 'faible' || v === 'moyenne' || v === 'critique';
export const isStatut = (v: unknown): v is EvenementStatut =>
  v === 'ouvert' || v === 'en_cours' || v === 'resolu' || v === 'annule';
