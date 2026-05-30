import { requireUser } from '@/lib/auth';
import { Settings } from 'lucide-react';
import { Link } from '@/navigation';
import { BottomNav } from '@/components/bottom-nav';
import { Sidebar } from '@/components/nav/sidebar';
import { UserMenu } from '@/components/auth/user-menu';

/**
 * Shell adaptativo:
 *  · Móvil  → header arriba + bottom-nav fija.
 *  · Desktop → sidebar a la izquierda; sin header ni bottom-nav.
 * El contenido de cada página se centra con <PageContainer> (max-w cómodo),
 * así no se estira de extremo a extremo en pantallas anchas.
 */
export default async function DashboardLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await requireUser(locale);

  return (
    <div className="flex min-h-dvh md:flex-row">
      <Sidebar user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header solo en móvil (en desktop la sidebar trae logo + usuario). */}
        <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-base/90 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="t-display text-lg tracking-tight text-text-primary">
              KINÉ<span className="text-accent">TICA</span>
            </span>
            <div className="flex items-center gap-1">
              <Link
                href="/settings"
                aria-label="Ajustes"
                className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary"
              >
                <Settings size={20} strokeWidth={1.5} />
              </Link>
              <UserMenu user={user} />
            </div>
          </div>
        </header>

        <main className="flex-1 pb-24 md:pb-0">{children}</main>

        <BottomNav />
      </div>
    </div>
  );
}
