'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav/nav-config';

/**
 * Navegación inferior — SOLO móvil (md:hidden). En desktop manda la Sidebar.
 */
export function BottomNav() {
  const t = useTranslations('navigation');
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-subtle bg-bg-elevated/90 backdrop-blur-md md:hidden">
      <div className="flex justify-around">
        {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-3 transition-colors',
                isActive ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 1.5} />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isActive ? 'text-accent' : 'text-text-muted'
                )}
              >
                {t(key)}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
