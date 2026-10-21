export interface KpiItem {
  id: string;
  title: string;
  value: string;
  total?: string;
  trend: string;
  trendUp: boolean;
  trendType?: 'positive' | 'warning' | 'danger' | 'info';
  period: string;
  icon: 'users' | 'clipboard' | 'check' | 'alert' | 'chat' | 'wallet';
  color: string;
}

export const topKpis: KpiItem[] = [
  {
    id: 'agents',
    title: 'Agents Connectés',
    value: '1 248',
    total: '/ 2 542',
    trend: '▲ 12.5%',
    trendUp: true,
    trendType: 'positive',
    period: 'En temps réel',
    icon: 'users',
    color: '#0284c7'
  },
  {
    id: 'missions-en-cours',
    title: 'Missions en cours',
    value: '386',
    total: '/ 1 024',
    trend: '▲ 8.3%',
    trendUp: true,
    trendType: 'positive',
    period: 'En temps réel',
    icon: 'clipboard',
    color: '#10b981'
  },
  {
    id: 'missions-terminees',
    title: 'Missions terminées',
    value: '2 153',
    total: '/ 2 542',
    trend: '▲ 18.7%',
    trendUp: true,
    trendType: 'positive',
    period: 'Aujourd\'hui',
    icon: 'check',
    color: '#9333ea'
  },
  {
    id: 'incidents-critiques',
    title: 'Incidents critiques',
    value: '23',
    trend: '▲ 4 nouveaux',
    trendUp: false,
    trendType: 'danger',
    period: '',
    icon: 'alert',
    color: '#ea580c'
  },
  {
    id: 'reclamations',
    title: 'Réclamations clients',
    value: '178',
    trend: '▲ 15 nouvelles',
    trendUp: false,
    trendType: 'info',
    period: 'En temps réel',
    icon: 'chat',
    color: '#06b6d4'
  },
  {
    id: 'recouvrement',
    title: 'Taux de recouvrement',
    value: '86.4%',
    trend: '▲ 5.2%',
    trendUp: true,
    trendType: 'positive',
    period: 'Ce mois',
    icon: 'wallet',
    color: '#059669'
  }
];

export const nationalSummary = [
  { label: 'Directions Régionales', count: 6, color: '#2563eb' },
  { label: 'Agences / Centres', count: 11, color: '#10b981' },
  { label: 'Stations de Pompage', count: 124, color: '#06b6d4' },
  { label: 'Réservoirs', count: 219, color: '#3b82f6' },
  { label: 'Équipes en Mission', count: 386, color: '#f59e0b' },
  { label: 'Incidents Critiques', count: 23, color: '#ef4444' }
];

export const mapCities = [
  { id: 'conakry', name: 'Conakry', x: 26.5, y: 72, isCapital: true },
  { id: 'boke', name: 'Boké', x: 24, y: 44 },
  { id: 'kindia', name: 'Kindia', x: 35, y: 64 },
  { id: 'labe', name: 'Labé', x: 37, y: 32 },
  { id: 'dalaba', name: 'Dalaba', x: 44, y: 45 },
  { id: 'kankan', name: 'Kankan', x: 53, y: 47 },
  { id: 'siguiri', name: 'Siguiri', x: 54, y: 28 },
  { id: 'kissidougou', name: 'Kissidougou', x: 47.5, y: 65 },
  { id: 'macenta', name: 'Macenta', x: 52, y: 74 },
  { id: 'nzerekore', name: "N'Zérékoré", x: 54.5, y: 83 }
];

export interface MapMarker {
  id: string;
  x: number; // percentage
  y: number; // percentage
  type: 'direction' | 'agence' | 'pompage' | 'reservoir' | 'incident' | 'mission';
  name: string;
  location: string;
  status: string;
}

export const mapMarkers: MapMarker[] = [
  // Conakry & Basse Guinée
  { id: 'm-cnk-1', x: 25.5, y: 73, type: 'direction', name: 'DR Conakry Nord & Sud', location: 'Conakry', status: 'Opérationnel' },
  { id: 'm-cnk-2', x: 27, y: 71, type: 'pompage', name: 'Station Yessoulou', location: 'Conakry', status: 'Débit normal' },
  { id: 'm-cnk-3', x: 28, y: 74, type: 'reservoir', name: 'Réservoir Bellevue', location: 'Dixinn', status: 'Capacité 92%' },
  { id: 'm-cnk-4', x: 29, y: 70, type: 'mission', name: 'Équipe M-08', location: 'Matam', status: 'Intervention' },
  { id: 'm-coy-1', x: 32, y: 68, type: 'incident', name: 'Fuite majeure', location: 'Coyah', status: 'En cours de réparation' },
  { id: 'm-kin-1', x: 35, y: 63, type: 'direction', name: 'Direction Régionale Kindia', location: 'Kindia', status: 'Opérationnel' },
  { id: 'm-kin-2', x: 36.5, y: 66, type: 'agence', name: 'Agence Centre Kindia', location: 'Kindia', status: 'Ouvert' },
  { id: 'm-kin-3', x: 33.5, y: 61, type: 'pompage', name: 'Station de Pompage Kindia', location: 'Kindia', status: 'Vérification maintenance' },
  { id: 'm-bok-1', x: 23, y: 43, type: 'direction', name: 'DR Boké', location: 'Boké', status: 'Opérationnel' },
  { id: 'm-bok-2', x: 21, y: 40, type: 'agence', name: 'Centre Kamsar', location: 'Kamsar', status: 'Normal' },
  { id: 'm-bok-3', x: 25, y: 47, type: 'reservoir', name: 'Réservoir Plateau', location: 'Boké', status: '85%' },
  { id: 'm-fri-1', x: 27.5, y: 55, type: 'agence', name: 'Agence Fria', location: 'Fria', status: 'Normal' },
  // Moyenne Guinée
  { id: 'm-lab-1', x: 38, y: 31, type: 'direction', name: 'DR Labé', location: 'Labé', status: 'Opérationnel' },
  { id: 'm-lab-2', x: 35, y: 34, type: 'agence', name: 'Agence Labé Centre', location: 'Labé', status: 'Actif' },
  { id: 'm-lab-3', x: 39, y: 28, type: 'reservoir', name: 'Réservoir Tata', location: 'Labé', status: 'Niveau d\'alerte 41%' },
  { id: 'm-dal-1', x: 43, y: 43, type: 'pompage', name: 'Station Dalaba', location: 'Dalaba', status: 'Opérationnel' },
  { id: 'm-dal-2', x: 44.5, y: 46, type: 'incident', name: 'Panne Pompe P2', location: 'Dalaba', status: 'Critique' },
  { id: 'm-mam-1', x: 41, y: 54, type: 'agence', name: 'Agence Mamou', location: 'Mamou', status: 'Opérationnel' },
  { id: 'm-mam-2', x: 42.5, y: 57, type: 'mission', name: 'Équipe Tech Mamou', location: 'Mamou', status: 'En patrouille' },
  { id: 'm-pit-1', x: 41, y: 38, type: 'pompage', name: 'Station Pita', location: 'Pita', status: 'Normal' },
  // Haute Guinée
  { id: 'm-kan-1', x: 52, y: 46, type: 'direction', name: 'DR Kankan', location: 'Kankan', status: 'Opérationnel' },
  { id: 'm-kan-2', x: 54, y: 48, type: 'agence', name: 'Agence Kankan Centre', location: 'Kankan', status: 'Actif' },
  { id: 'm-kan-3', x: 50.5, y: 44, type: 'incident', name: 'Fuite Secteur Kankan 2', location: 'Kankan', status: 'Alerte critique' },
  { id: 'm-kan-4', x: 55, y: 45, type: 'reservoir', name: 'Réservoir Bordo', location: 'Kankan', status: '78%' },
  { id: 'm-sig-1', x: 53.5, y: 27, type: 'agence', name: 'Agence Siguiri', location: 'Siguiri', status: 'Actif' },
  { id: 'm-sig-2', x: 55, y: 30, type: 'pompage', name: 'Pompage Fleuve Milo', location: 'Siguiri', status: 'Normal' },
  { id: 'm-sig-3', x: 51, y: 31, type: 'mission', name: 'Équipe Siguiri 1', location: 'Siguiri', status: 'En mission' },
  { id: 'm-dab-1', x: 46, y: 41, type: 'agence', name: 'Centre Dabola', location: 'Dabola', status: 'Normal' },
  { id: 'm-kour-1', x: 49, y: 37, type: 'agence', name: 'Centre Kouroussa', location: 'Kouroussa', status: 'Normal' },
  // Guinée Forestière
  { id: 'm-kis-1', x: 46.5, y: 64, type: 'direction', name: 'DR Kissidougou', location: 'Kissidougou', status: 'Opérationnel' },
  { id: 'm-kis-2', x: 48.5, y: 66, type: 'pompage', name: 'Station Niandan', location: 'Kissidougou', status: 'Normal' },
  { id: 'm-gue-1', x: 49.5, y: 70, type: 'agence', name: 'Agence Guéckédou', location: 'Guéckédou', status: 'Actif' },
  { id: 'm-mac-1', x: 51.5, y: 73, type: 'agence', name: 'Centre Macenta', location: 'Macenta', status: 'Normal' },
  { id: 'm-mac-2', x: 53, y: 75, type: 'reservoir', name: 'Réservoir Macenta', location: 'Macenta', status: '65%' },
  { id: 'm-nze-1', x: 54, y: 82, type: 'direction', name: 'DR N\'Zérékoré', location: 'N\'Zérékoré', status: 'Opérationnel' },
  { id: 'm-nze-2', x: 55.5, y: 84, type: 'pompage', name: 'Pompage Tilé', location: 'N\'Zérékoré', status: 'Normal' },
  { id: 'm-nze-3', x: 53, y: 86, type: 'mission', name: 'Équipe Forestière 3', location: 'N\'Zérékoré', status: 'Inspection' },
  { id: 'm-lol-1', x: 56, y: 87, type: 'agence', name: 'Centre Lola', location: 'Lola', status: 'Actif' }
];

export const waterProductionData = [
  { hour: '00:00', prod: 45000 },
  { hour: '04:00', prod: 82000 },
  { hour: '06:00', prod: 76000 },
  { hour: '08:00', prod: 98000 },
  { hour: '10:00', prod: 115000 },
  { hour: '12:00', prod: 132000 },
  { hour: '14:00', prod: 126000 },
  { hour: '16:00', prod: 154782 },
  { hour: '18:00', prod: 147000 },
  { hour: '20:00', prod: 142000 },
  { hour: '22:00', prod: 145000 },
  { hour: '24:00', prod: 148000 }
];

export const regionalDistribution = [
  { name: 'Conakry Nord', agents: 842, pct: '33.1%', color: '#2563eb' },
  { name: 'Conakry Sud', agents: 623, pct: '24.5%', color: '#06b6d4' },
  { name: 'Basse Guinée', agents: 412, pct: '16.2%', color: '#10b981' },
  { name: 'Moyenne Guinée', agents: 328, pct: '12.9%', color: '#f59e0b' },
  { name: 'Haute Guinée', agents: 225, pct: '8.8%', color: '#ef4444' },
  { name: 'Guinée Forestière', agents: 112, pct: '4.4%', color: '#8b5cf6' }
];

export const missionsStatusData = [
  { status: 'En attente', count: 285, color: '#f59e0b' },
  { status: 'Acceptées', count: 162, color: '#3b82f6' },
  { status: 'En cours', count: 386, color: '#10b981' },
  { status: 'Terminées', count: 2153, color: '#9333ea' },
  { status: 'Annulées', count: 45, color: '#64748b' },
  { status: 'Interrompues', count: 32, color: '#ef4444' }
];

export const incidentsByType = [
  { id: '1', label: "Fuite d'eau", count: 58, change: 8, up: true, icon: 'droplet' },
  { id: '2', label: 'Conduite cassée', count: 36, change: 5, up: true, icon: 'wrench' },
  { id: '3', label: 'Baisse de pression', count: 24, change: 2, up: true, icon: 'gauge' },
  { id: '4', label: 'Panne de pompe', count: 18, change: 3, up: false, icon: 'alert' },
  { id: '5', label: 'Problème électrique', count: 12, change: 1, up: false, icon: 'zap' },
  { id: '6', label: 'Autres', count: 21, change: 0, up: null, icon: 'help' }
];

export const recentAlerts = [
  {
    id: 'a1',
    title: 'Fuite majeure détectée',
    location: 'Kankan - Secteur Kankan 2',
    time: '10:42',
    severity: 'critical'
  },
  {
    id: 'a2',
    title: 'Niveau réservoir critique',
    location: 'Réservoir Bellevue - Labé',
    time: '10:28',
    severity: 'warning'
  },
  {
    id: 'a3',
    title: 'Panne de pompe',
    location: 'Station de pompage - Kindia',
    time: '10:15',
    severity: 'warning'
  },
  {
    id: 'a4',
    title: 'Intervention urgente assignée',
    location: 'Coyah - Fuite sur conduite principale',
    time: '10:05',
    severity: 'info'
  }
];

export const regionsPerformance = [
  { region: 'Conakry Nord', perf: 92 },
  { region: 'Conakry Sud', perf: 89 },
  { region: 'Basse Guinée', perf: 85 },
  { region: 'Moyenne Guinée', perf: 83 },
  { region: 'Haute Guinée', perf: 81 },
  { region: 'Guinée Forestière', perf: 78 }
];

export const newsTickerItems = [
  '10:43 - Intervention terminée à Dixinn',
  '10:41 - Nouvelle réclamation à Matoto',
  '10:38 - Mission assignée à Kindia',
  '10:35 - Paiement reçu de 2 450 000 GNF',
  '10:32 - Stock critique à Kankan'
];
