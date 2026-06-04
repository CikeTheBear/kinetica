'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownRight, ArrowUpRight, Minus, Scale } from 'lucide-react';
import { PageContainer } from '@/components/page-container';
import {
  summarizeWeightTrend,
  type BiometricEntry,
} from '@/lib/biometrics';
import { WeighInForm, type WeighInPayload } from './weigh-in-form';
import { WeightChart } from './weight-chart';

/**
 * Vista de registro biométrico manual. Recibe el historial inicial (server) y
 * gestiona en cliente los nuevos pesajes: al guardar, hace POST y refresca la
 * serie con el GET para que el peso actual, el delta y el gráfico se actualicen.
 */
export function BiometricsView({
  initialEntries,
}: {
  initialEntries: BiometricEntry[];
}) {
  const t = useTranslations('biometrics');
  const [entries, setEntries] = useState<BiometricEntry[]>(initialEntries);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // El resumen (último peso, delta, serie) se deriva de las entradas: una sola
  // fuente de verdad. useMemo evita recalcular en cada render.
  const trend = useMemo(() => summarizeWeightTrend(entries), [entries]);

  const handleSubmit = async (payload: WeighInPayload) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/biometrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');

      // Refrescar el historial desde el server para tener el estado canónico.
      const getRes = await fetch('/api/biometrics', { cache: 'no-store' });
      if (getRes.ok) {
        const json = (await getRes.json()) as { entries: BiometricEntry[] };
        setEntries(json.entries ?? []);
      }
    } catch {
      setSaveError(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const hasData = trend.serie.length > 0;

  return (
    <PageContainer>
      <p className="font-mono-metrics text-[11px] uppercase tracking-[0.25em] text-text-muted">
        {t('title')}
      </p>

      {/* Peso actual + delta. */}
      {hasData && (
        <div className="mt-5 flex items-end gap-4 rounded-2xl border border-border-default bg-bg-elevated p-5">
          <div>
            <p className="font-mono-metrics text-xs uppercase tracking-[0.15em] text-text-muted">
              {t('currentWeight')}
            </p>
            <p className="mt-1 font-mono-metrics text-3xl font-semibold text-text-primary">
              {trend.pesoActualKg}
              <span className="ml-1 text-base text-text-muted">{t('kgUnit')}</span>
            </p>
          </div>
          {trend.deltaKg !== null && <DeltaBadge deltaKg={trend.deltaKg} />}
        </div>
      )}

      <div className="mt-4">
        <WeighInForm onSubmit={handleSubmit} saving={saving} />
        {saveError && <p className="mt-2 text-sm text-accent-2">{saveError}</p>}
      </div>

      {hasData ? (
        <div className="mt-4">
          <WeightChart serie={trend.serie} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-border-subtle bg-bg-elevated px-4 py-12 text-center">
          <Scale size={40} className="mb-3 text-text-muted" strokeWidth={1.5} />
          <h2 className="t-display text-lg text-text-primary">{t('emptyTitle')}</h2>
          <p className="mt-1 max-w-xs text-sm text-text-secondary">{t('emptyBody')}</p>
        </div>
      )}
    </PageContainer>
  );
}

/**
 * Badge del delta de peso. Verde si baja, accent-2 si sube (sin asumir que
 * "bajar" es bueno: solo damos color de cambio). Cero → neutro.
 */
function DeltaBadge({ deltaKg }: { deltaKg: number }) {
  const t = useTranslations('biometrics');

  if (deltaKg === 0) {
    return (
      <span className="mb-1 inline-flex items-center gap-1 text-sm text-text-muted">
        <Minus size={14} strokeWidth={1.5} />
        0 {t('kgUnit')}
      </span>
    );
  }

  const subio = deltaKg > 0;
  const Icon = subio ? ArrowUpRight : ArrowDownRight;
  // Subida en accent-2 (rojo/magenta del tema), bajada en verde de éxito.
  const color = subio ? 'text-accent-2' : 'text-status-success';

  return (
    <span className={`mb-1 inline-flex items-center gap-1 font-mono-metrics text-sm ${color}`}>
      <Icon size={14} strokeWidth={2} />
      {subio ? '+' : ''}
      {deltaKg} {t('kgUnit')}
      <span className="ml-1 text-text-muted">{t('vsPrev')}</span>
    </span>
  );
}
