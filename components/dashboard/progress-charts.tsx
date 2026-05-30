'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PuntoFrecuencia, PuntoVolumen } from '@/lib/progress';

// Recharts espera strings de color (no clases Tailwind). Leemos los tokens CSS
// del tema activo en runtime para que las gráficas cambien con el tema.
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

/**
 * Gráficas de progreso del usuario (volumen por sesión y frecuencia semanal).
 * Recibe los datos ya agregados por lib/progress.ts; aquí solo se dibujan.
 */
export function ProgressCharts({
  volumenPorSesion,
  frecuenciaSemanal,
}: {
  volumenPorSesion: PuntoVolumen[];
  frecuenciaSemanal: PuntoFrecuencia[];
}) {
  const t = useTranslations('progress');
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

  // Adaptar los datos al formato {label, valor} que consumen las gráficas.
  const dataVolumen = volumenPorSesion.map((p) => ({
    label: formatDiaMes(p.fecha),
    valor: p.volumenKg,
  }));
  const dataFrecuencia = frecuenciaSemanal.map((p) => ({
    label: formatDiaMes(p.semanaInicio),
    valor: p.entrenos,
  }));

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
      <ChartCard title={t('volumeTitle')} subtitle={t('volumeSubtitle')}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataVolumen} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
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
            <Tooltip cursor={{ fill: colors.accent, fillOpacity: 0.08 }} content={<ChartTooltip unit="kg" />} />
            <Bar dataKey="valor" fill={colors.accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('frequencyTitle')} subtitle={t('frequencySubtitle')}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataFrecuencia} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
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
              allowDecimals={false}
            />
            <Tooltip cursor={{ fill: colors.accent2, fillOpacity: 0.1 }} content={<ChartTooltip unit={t('workoutsUnit')} />} />
            <Bar dataKey="valor" fill={colors.accent2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mb-3 text-xs text-text-muted">{subtitle}</p>
      {children}
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
