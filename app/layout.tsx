import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/components/ThemeProvider';
import { MobileNavToggle } from '@/components/MobileNavToggle';

export const metadata = {
  title: 'SEG CONNECT — Tableau de bord Exécutif',
  description: 'Direction Générale - Vue Nationale en Temps Réel · Société des Eaux de Guinée'
};

export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 };

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AppShell>
              {children}
            </AppShell>
            <MobileNavToggle />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}