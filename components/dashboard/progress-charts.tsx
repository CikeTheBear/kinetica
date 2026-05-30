'use client';

import { useLocale, useTranslations } from 'next-intl';
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

// Colores del design system (no podemos pasar clases de Tailwind a recharts,
// que espera strings de color; usamos los hex del tailwind.config).
const ACCENT = '#E5FF00';
const SUCCESS = '#4ADE80';
const GRID = '#1E2733'; // border-subtle
const AXIS_TEXT = '#5A6573'; // text-muted

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
    <div className="space-y-6">
      <ChartCard title={t('volumeTitle')} subtitle={t('volumeSubtitle')}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataVolumen} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: 'rgba(229, 255, 0, 0.08)' }}
              content={<ChartTooltip unit="kg" />}
            />
            <Bar dataKey="valor" fill={ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('frequencyTitle')} subtitle={t('frequencySubtitle')}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataFrecuencia} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(74, 222, 128, 0.1)' }}
              content={<ChartTooltip unit={t('workoutsUnit')} />}
            />
            <Bar dataKey="valor" fill={SUCCESS} radius={[4, 4, 0, 0]} />
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
