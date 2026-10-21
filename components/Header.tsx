'use client';

import { useState, useEffect } from 'react';
import { Maximize2, Minimize2, LogOut, ChevronDown, Sun, Moon, User as UserIcon } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [time, setTime] = useState('--:--:--');
  const [dateStr, setDateStr] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      const formattedDate = now.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      setDateStr(formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const displayName = fullName.trim() || user?.displayName || 'Utilisateur';
  const initials = (user?.firstName?.[0] || '') + (user?.lastName?.[0] || '');
  const avatarUrl = user?.avatar || '';
  const avatarSafe =
    /^\/uploads\/profiles\/user-[a-zA-Z0-9-]+-[a-f0-9]+\.webp$/.test(avatarUrl)
      ? avatarUrl
      : '';

  return (
    <header className="top-header">
      <div className="header-title">
        <h2>Tableau de bord Exécutif</h2>
        <p>Direction Générale - Vue Nationale en Temps Réel</p>
      </div>

      <div className="header-right">
        {/* Live Clock & Date */}
        <div className="header-clock">
          <div className="clock-time">{time}</div>
          <div className="clock-date">{dateStr}</div>
        </div>

        {/* Centre de notifications DG */}
        <NotificationBell />

        {/* Theme Toggle */}
        <button
          className="header-icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          aria-label="Basculer le thème"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Fullscreen Toggle */}
        <button
          className="header-icon-btn"
          onClick={toggleFullscreen}
          title="Plein écran"
          aria-label="Mode plein écran"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* User Profile */}
        <div className="user-profile" style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 0 }}
          >
            <div
              className="avatar-img"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: avatarSafe ? 'transparent' : 'linear-gradient(135deg, #1e3a5f 0%, #0f2038 100%)',
                color: '#38bdf8',
                fontWeight: 'bold',
                fontSize: '13px',
                overflow: 'hidden',
              }}
            >
              {avatarSafe ? <img src={avatarSafe} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (initials || 'DG')}
            </div>
            <div className="user-info">
              <div className="user-name">{displayName}</div>
              <div className="user-role">{user?.jobTitle?.trim() || user?.role || 'SEG Guinée'}</div>
            </div>
            <ChevronDown size={14} color="#556c84" />
          </button>

          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 45,
                  minWidth: 200, background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', padding: 6, overflow: 'hidden'
                }}
              >
                <a href="/profile" style={{ ...styles.menuItem }}>
                  <UserIcon size={14} /> Mon profil
                </a>
                <button
                  onClick={() => logout()}
                  style={{ ...styles.menuItem, width: '100%', color: 'var(--accent-red)' }}
                >
                  <LogOut size={14} /> Déconnexion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
    fontSize: 13, color: 'var(--text-main)', textDecoration: 'none', borderRadius: 7,
    cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left'
  },
};