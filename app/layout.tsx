import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata = {
  title: 'SEG CONNECT — Tableau de bord Exécutif',
  description: 'Direction Générale - Vue Nationale en Temps Réel · Société des Eaux de Guinée'
};

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
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}