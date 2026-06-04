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
import type { PuntoPeso } from '@/lib/biometrics';

// Recharts espera strings de color (no clases Tailwind). Leemos los tokens CSS
// del tema activo en runtime para que la gráfica cambie con el tema.
// Mismo patrón que components/dashboard/progress-charts.tsx.
const FALLBACK = { accent: '#E5FF00', grid: '#1b2230', axis: '#5a6473' };

function useThemeColors() {
  const { theme } = useTheme();
  const [colors, setColors] = useState(FALLBACK);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    setColors({
      accent: v('--accent', FALLBACK.accent),
      grid: v('--border-default', FALLBACK.grid),
      axis: v('--text-muted', FALLBACK.axis),
    });
  }, [theme]);
  return colors;
}

/**
 * Gráfico de evolución del peso corporal. Recibe la serie ya ordenada por
 * lib/biometrics.ts; aquí solo se dibuja una línea con los pesajes.
 */
export function WeightChart({ serie }: { serie: PuntoPeso[] }) {
  const t = useTranslations('biometrics');
  const locale = useLocale();
  const intlLocale = locale === 'en' ? 'en-US' : 'es-ES';
  const colors = useThemeColors();

  const formatDiaMes = (fecha: string) => {
    const [y, m, d] = fecha.split('-').map((n) => parseInt(n, 10));
    return new Date(y, m - 1, d).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
    });
  };

  const data = serie.map((p) => ({
    label: formatDiaMes(p.fecha),
    valor: p.pesoKg,
  }));

  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
      <h3 className="text-sm font-semibold text-text-primary">{t('chartTitle')}</h3>
      <p className="mb-3 text-xs text-text-muted">{t('chartSubtitle')}</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
            domain={['dataMin - 1', 'dataMax + 1']}
          />
          <Tooltip
            cursor={{ stroke: colors.accent, strokeOpacity: 0.3 }}
            content={<ChartTooltip unit={t('kgUnit')} />}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={colors.accent}
            strokeWidth={2}
            dot={{ fill: colors.accent, r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tooltip oscuro coherente con el design system. */
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
