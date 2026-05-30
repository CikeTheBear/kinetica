'use client';

import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/navigation';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/auth/user-menu';
import { NAV_ITEMS } from './nav-config';

// Mismo shape estructural que UserMenu (desacoplado del tipo de Supabase).
interface SidebarUser {
  id: string;
  email?: string;
  user_metadata?: { nombre?: string };
}

/**
 * Barra lateral de navegación para DESKTOP (oculta en móvil, donde manda la
 * bottom-nav). Logo arriba, ítems en el centro, ajustes + usuario abajo.
 */
export function Sidebar({ user }: { user: SidebarUser }) {
  const t = useTranslations('navigation');
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-base/40 px-4 py-6 backdrop-blur-md md:flex">
      <span className="mb-8 px-2 t-display text-xl tracking-tight text-text-primary">
        KINÉ<span className="text-accent">TICA</span>
      </span>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.5} />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-between border-t border-border-subtle pt-4">
        <Link
          href="/settings"
          aria-label="Ajustes"
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary"
        >
          <Settings size={20} strokeWidth={1.5} />
        </Link>
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
