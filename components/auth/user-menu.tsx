'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { signOut } from '@/app/actions/auth';
import { LogOut, User } from 'lucide-react';

interface UserMenuProps {
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      nombre?: string;
    };
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const t = useTranslations('auth');
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName =
    user.user_metadata?.nombre || user.email?.split('@')[0] || 'Usuario';

  // Cierra el menú al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSignOut() {
    const result = await signOut();
    if (result?.success && result?.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-overlay text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
        aria-label="Menú de usuario"
      >
        <User size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-11 w-56 rounded-xl border border-border-default bg-bg-elevated p-2 shadow-lg">
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-text-primary">{displayName}</p>
            <p className="text-xs text-text-muted">{user.email}</p>
          </div>
          <div className="my-1 border-t border-border-subtle" />
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-overlay hover:text-status-danger"
          >
            <LogOut size={16} />
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
