import { LayoutDashboard, CalendarDays, MessageCircle, Scale, type LucideIcon } from 'lucide-react';

/**
 * Ítems de navegación compartidos entre la bottom-nav (móvil) y la sidebar
 * (desktop). Una sola fuente de verdad para no desincronizarlos.
 * `key` es la clave i18n dentro del namespace 'navigation'.
 */
export const NAV_ITEMS: { href: string; key: string; icon: LucideIcon }[] = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/plan', key: 'plan', icon: CalendarDays },
  { href: '/biometrics', key: 'body', icon: Scale },
  { href: '/coach', key: 'coach', icon: MessageCircle },
];
