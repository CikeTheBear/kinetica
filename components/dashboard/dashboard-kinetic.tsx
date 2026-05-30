'use client';

import { useTranslations } from 'next-intl';
import type { ProgressData } from '@/lib/progress';
import { CountUp } from './count-up';
import { ProgressCharts } from './progress-charts';

/**
 * Variante KINETIC del Dashboard — poster atlético.
 * Número héroe gigante en diagonal (skew) con Anton, kicker inclinado, frase
 * motivadora, y chips con acento/acento-2. Misma data que la variante Redline.
 */
export function DashboardKinetic({ progress }: { progress: ProgressData }) {
  const tp = useTranslations('progress');
  const { summary } = progress;

  return (
    <div className="space-y-6">
      {/* HERO poster */}
      <div className="animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_both]">
        <p
          className="t-display text-xs uppercase tracking-[0.3em] text-accent"
          style={{ transform: 'skewX(-8deg)' }}
        >
          {tp('statVolume')}
        </p>
        <div
          className="t-display uppercase leading-[0.82] text-text-primary"
          style={{ transform: 'skewX(-5deg)' }}
        >
          <div className="text-[68px]" style={{ textShadow: '0 0 40px var(--accent-glow)' }}>
            <CountUp to={summary.volumenTotalKg} />
          </div>
          <div
            className="text-[34px]"
            style={{ WebkitTextStroke: '1.5px var(--text-primary)', color: 'transparent' }}
          >
            KG TOTALES
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
          <span style={{ color: 'var(--accent-2)' }}>🔥</span>
          {summary.rachaSemanas > 0 ? (
            <>
              Racha de{' '}
              <b className="text-text-primary">
                <CountUp to={summary.rachaSemanas} /> {tp('streakUnit')}
              </b>{' '}
              — sigue así
            </>
          ) : (
            <>Registra entrenos para encender tu racha</>
          )}
        </p>
      </div>

      {/* CHIPS */}
      <div className="grid grid-cols-2 gap-2.5 animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_.08s_both]">
        <KineticChip value={<CountUp to={summary.totalEntrenos} />} label={tp('statWorkouts')} color="var(--accent)" />
        <KineticChip
          value={
            <>
              <CountUp to={summary.rachaSemanas} />
              <span className="ml-1 text-2xl text-text-muted">{tp('streakUnit')}</span>
            </>
          }
          label={tp('statStreak')}
          color="var(--accent-2)"
        />
      </div>

      <div className="animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_.16s_both]">
        <ProgressCharts
          volumenPorSesion={progress.volumenPorSesion}
          frecuenciaSemanal={progress.frecuenciaSemanal}
        />
      </div>
    </div>
  );
}

function KineticChip({
  value,
  label,
  color,
}: {
  value: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border-default bg-bg-elevated p-4">
      <div className="t-display text-4xl leading-none" style={{ color }}>
        {value}
      </div>
      <p className="mt-1.5 text-[11px] uppercase tracking-[0.12em] text-text-muted">{label}</p>
    </div>
  );
}
