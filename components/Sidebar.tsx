'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Globe,
  Map,
  Building2,
  Users,
  ClipboardList,
  AlertTriangle,
  Droplets,
  Network,
  Gauge,
  MessageSquare,
  CreditCard,
  Boxes,
  UserCheck,
  BarChart3,
  Settings,
  UserCog,
  ScrollText,
  AlertOctagon,
  Bell,
  FileSpreadsheet,
  ShieldCheck,
  FolderOpen,
  Truck
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

const menuItems: { href: string; label: string; icon: any; permission: string }[] = [
  { href: '/', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'dashboard.view' },
  { href: '/tableau-technique', label: 'Tableau de bord technique', icon: Gauge, permission: 'dashboard.view' },
  { href: '/notifications', label: 'Centre de Notifications', icon: Bell, permission: 'notifications.view' },
  { href: '/import', label: 'Import des Données', icon: FileSpreadsheet, permission: 'imports.view' },
  { href: '/import/quality', label: 'Qualité des Données', icon: ShieldCheck, permission: 'imports.view' },
  { href: '/vue-nationale', label: 'Vue Nationale', icon: Globe, permission: 'national.view' },
  { href: '/territoire', label: 'Carte Interactive', icon: Map, permission: 'map.view' },
  { href: '/agences', label: 'Agences & Centres', icon: Building2, permission: 'agencies.view' },
  { href: '/agents', label: 'Agents & Équipes', icon: Users, permission: 'agents.view' },
  { href: '/missions', label: 'Missions', icon: ClipboardList, permission: 'missions.view' },
  { href: '/incidents', label: 'Incidents & Signalements', icon: AlertTriangle, permission: 'incidents.view' },
  { href: '/exploitation', label: 'Production & Réservoirs', icon: Droplets, permission: 'production.view' },
  { href: '/reseau', label: 'Réseau & Fuites', icon: Network, permission: 'network.view' },
  { href: '/compteurs', label: 'Compteurs', icon: Gauge, permission: 'meters.view' },
  { href: '/clients', label: 'Clients & Réclamations', icon: MessageSquare, permission: 'clients.view' },
  { href: '/commercial', label: 'Facturation & Paiements', icon: CreditCard, permission: 'billing.view' },
  { href: '/kpi/impayes-agences', label: 'État des impayés par agence', icon: AlertTriangle, permission: 'billing.view' },
  { href: '/kpi/approvisionnement', label: 'Approvisionnement', icon: Truck, permission: 'approvisionnement.view' },
  { href: '/stocks', label: 'Stocks & Magasins', icon: Boxes, permission: 'stocks.view' },
  { href: '/rh', label: 'Ressources Humaines', icon: UserCheck, permission: 'hr.view' },
  { href: '/analyses', label: 'Rapports & Analyses', icon: BarChart3, permission: 'reports.view' },
  { href: '/documents', label: 'Documents & Archives', icon: FolderOpen, permission: 'dashboard.view' },
];

const adminItems: { href: string; label: string; icon: any; permission: string }[] = [
  { href: '/users', label: 'Gestion des Utilisateurs', icon: UserCog, permission: 'users.view' },
  { href: '/roles', label: 'Rôles & Permissions', icon: ShieldCheck, permission: 'roles.view' },
  { href: '/audit', label: 'Journal d’Audit', icon: ScrollText, permission: 'audit.view' },
  { href: '/parametres', label: 'Paramètres', icon: Settings, permission: 'settings.view' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  const visibleMenu = menuItems.filter((i) => hasPermission(i.permission));
  const visibleAdmin = adminItems.filter((i) => hasPermission(i.permission));

  return (
    <aside className="sidebar-container">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="logo-icon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ico.jpeg" alt="SEG" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
        </div>
        <div className="logo-text">
          <h1>SEG<span>CONNECT</span></h1>
          <p>Société des Eaux de Guinée</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {visibleMenu.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) ||
            (item.href === '/import' && (pathname.startsWith('/import/') && !pathname.startsWith('/import/quality')));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {visibleAdmin.length > 0 && (
          <div className="sidebar-section-label">Administration</div>
        )}
        {visibleAdmin.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Emergency Mode Button */}
      <div className="sidebar-footer">
        <button
          className="btn-emergency"
          onClick={() => alert('Mode Urgence : Mobilisation générale et cellule de crise SEG activée')}
        >
          <AlertOctagon size={16} />
          <span>Mode Urgence</span>
        </button>
      </div>
    </aside>
  );
}