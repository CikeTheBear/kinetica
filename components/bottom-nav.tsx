'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/navigation';
import { LayoutDashboard, CalendarDays, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const t = useTranslations('navigation');
  const pathname = usePathname();

  const tabs = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/plan', label: t('plan'), icon: CalendarDays },
    { href: '/coach', label: t('coach'), icon: MessageCircle },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-subtle bg-bg-elevated/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-3 transition-colors',
                isActive
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon
                size={24}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isActive ? 'text-accent' : 'text-text-muted'
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
      {/* Safe area padding for notched devices */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
