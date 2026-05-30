'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const THEMES = ['redline', 'kinetic'] as const;

/**
 * Selector de tema para Ajustes. Cada tarjeta muestra un mini-preview FIEL del
 * tema: el `data-theme` en el contenedor re-scopea los tokens CSS, así que el
 * preview se pinta con la paleta y fuentes reales de ese tema (aunque el resto
 * de la app esté en el otro).
 *
 * next-themes devuelve `theme` undefined en el primer render (antes de montar);
 * gateamos con `mounted` para no marcar la opción equivocada ni romper hidratación.
 */
export function ThemePicker() {
  const t = useTranslations('settings');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = mounted ? theme : undefined;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {THEMES.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setTheme(id)}
          aria-pressed={active === id}
          className={cn(
            'relative overflow-hidden rounded-2xl border p-3 text-left transition-all',
            active === id
              ? 'border-accent ring-1 ring-accent'
              : 'border-border-default hover:border-text-muted'
          )}
        >
          {active === id && (
            <span className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent">
              <Check size={14} strokeWidth={3} />
            </span>
          )}

          {/* Mini-preview fiel: data-theme re-scopea los tokens */}
          <div data-theme={id} className="rounded-xl bg-bg-base p-4">
            <div className="t-display text-base text-text-primary">
              KINÉ<span className="text-accent">TICA</span>
            </div>
            <div className="mt-2 t-display text-3xl leading-none text-text-primary">
              12,480
              <span className="ml-1 font-mono-metrics text-[10px] text-text-muted">KG</span>
            </div>
            <div className="mt-3 flex gap-1">
              <span className="h-2 flex-[3] rounded-sm bg-accent" />
              <span
                className="h-2 flex-[2] rounded-sm"
                style={{ background: 'var(--accent-2)' }}
              />
              <span className="h-2 flex-1 rounded-sm bg-border-default" />
            </div>
          </div>

          <div className="mt-3 t-display text-base text-text-primary">{t(`theme_${id}`)}</div>
          <p className="mt-0.5 text-xs leading-snug text-text-secondary">
            {t(`theme_${id}_desc`)}
          </p>
        </button>
      ))}
    </div>
  );
}
