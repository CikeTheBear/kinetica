'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronDown, Dumbbell, Trophy } from 'lucide-react';
import type { ExerciseRecord } from '@/lib/records';

/**
 * Vista de récords e historial POR EJERCICIO.
 *
 * Hace fetch LAZY al endpoint /api/progress/records (no en el server) para no
 * cargar la lista hasta que el usuario llega a la página y para mantener el
 * dato fresco (no-store). Cada ejercicio se muestra como una tarjeta con su PR
 * destacado; al expandirla aparece el gráfico de evolución del e1RM.
 */

// Recharts espera strings de color (no clases Tailwind), así que leemos los
// tokens CSS del tema activo en runtime — mismo patrón que progress-charts.tsx,
// para que el gráfico cambie de color al cambiar de tema.
const FALLBACK = { accent: '#E5FF00', accent2: '#FF3B30', grid: '#1b2230', axis: '#5a6473' };

function useThemeColors() {
  const { theme } = useTheme();
  const [colors, setColors] = useState(FALLBACK);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    setColors({
      accent: v('--accent', FALLBACK.accent),
      accent2: v('--accent-2', FALLBACK.accent2),
      grid: v('--border-default', FALLBACK.grid),
      axis: v('--text-muted', FALLBACK.axis),
    });
  }, [theme]);
  return colors;
}

type FetchState = 'loading' | 'error' | 'ready';

export function ExerciseRecords() {
  const t = useTranslations('records');
  const [state, setState] = useState<FetchState>('loading');
  const [records, setRecords] = useState<ExerciseRecord[]>([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch('/api/progress/records');
        if (!res.ok) throw new Error('fetch failed');
        const data = (await res.json()) as { records: ExerciseRecord[] };
        if (!cancelado) {
          setRecords(data.records ?? []);
          setState('ready');
        }
      } catch {
        if (!cancelado) setState('error');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (state === 'loading') {
    return <p className="mt-6 text-sm text-text-muted">{t('loading')}</p>;
  }

  if (state === 'error') {
    return <p className="mt-6 text-sm text-accent-2">{t('error')}</p>;
  }

  if (records.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-border-subtle bg-bg-elevated px-4 py-12 text-center">
        <Dumbbell size={40} className="mb-3 text-text-muted" strokeWidth={1.5} />
        <h2 className="t-display text-lg text-text-primary">{t('emptyTitle')}</h2>
        <p className="mt-1 max-w-xs text-sm text-text-secondary">{t('emptyBody')}</p>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {records.map((rec) => (
        <ExerciseCard key={rec.wgerId} record={rec} />
      ))}
    </ul>
  );
}

function ExerciseCard({ record }: { record: ExerciseRecord }) {
  const t = useTranslations('records');
  const locale = useLocale();
  const intlLocale = locale === 'en' ? 'en-US' : 'es-ES';
  const [open, setOpen] = useState(false);
  const colors = useThemeColors();

  const formatDiaMes = (fecha: string) => {
    const [y, m, d] = fecha.split('-').map((n) => parseInt(n, 10));
    return new Date(y, m - 1, d).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
    });
  };

  // Datos para el gráfico de evolución del e1RM.
  const chartData = record.historial.map((p) => ({
    label: formatDiaMes(p.fecha),
    e1rm: p.e1rm,
  }));

  const sesiones = record.historial.length;
  // Tendencia simple para el mini-resumen: e1RM de la última sesión vs la primera.
  const primero = record.historial[0]?.e1rm ?? 0;
  const ultimo = record.historial[sesiones - 1]?.e1rm ?? 0;
  const deltaE1rm = Math.round((ultimo - primero) * 10) / 10;

  return (
    <li className="overflow-hidden rounded-xl border border-border-default bg-bg-elevated">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/5"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{record.nombre}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Stat label={t('prWeight')} value={`${record.pr.pesoMaxKg} kg`} highlight />
            <Stat label={t('prE1rm')} value={`${record.pr.e1rmMax} kg`} />
            <Stat label={t('prReps')} value={`${record.pr.repsMax}`} />
          </div>
        </div>
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-border-subtle px-4 pb-4 pt-3">
          <div className="mb-3 flex items-center gap-2 text-xs text-text-secondary">
            <Trophy size={14} strokeWidth={1.5} className="text-accent" />
            <span>
              {t('sessionCount', { count: sesiones })}
              {sesiones > 1 && (
                <>
                  {' · '}
                  <span className={deltaE1rm >= 0 ? 'text-status-success' : 'text-accent-2'}>
                    {deltaE1rm >= 0 ? '+' : ''}
                    {deltaE1rm} kg e1RM
                  </span>
                </>
              )}
            </span>
          </div>

          {sesiones >= 2 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: colors.grid }}
                />
                <YAxis
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ stroke: colors.accent, strokeOpacity: 0.3 }}
                  content={<ChartTooltip unit="kg e1RM" />}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  stroke={colors.accent}
                  strokeWidth={2}
                  dot={{ fill: colors.accent, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-text-muted">{t('needMoreSessions')}</p>
          )}
        </div>
      )}
    </li>
  );
}

/** Métrica compacta (label + valor) para la cabecera de cada ejercicio. */
function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span
        className={`font-mono-metrics text-sm font-semibold ${
          highlight ? 'text-accent' : 'text-text-primary'
        }`}
      >
        {value}
      </span>
    </span>
  );
}

/** Tooltip oscuro coherente con el design system (igual que progress-charts.tsx). */
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border-default bg-bg-overlay px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-mono-metrics text-sm font-semibold text-text-primary">
        {payload[0].value} {unit}
      </p>
    </div>
  );
}
