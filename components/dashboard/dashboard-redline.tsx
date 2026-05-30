'use client';

import { useTranslations } from 'next-intl';
import { Dumbbell, Flame } from 'lucide-react';
import { Link } from '@/navigation';
import type { ProgressData } from '@/lib/progress';
import type { PlanDia } from './dashboard-view';
import { CountUp } from './count-up';
import { ProgressCharts } from './progress-charts';

// Día actual (componentes locales) → nombre canónico del plan.
const WEEK = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const ABBR: Record<string, string> = {
  lunes: 'LUN',
  martes: 'MAR',
  miercoles: 'MIÉ',
  jueves: 'JUE',
  viernes: 'VIE',
  sabado: 'SÁB',
  domingo: 'DOM',
};

/**
 * Variante REDLINE del Dashboard — telemetría de motorsport, fiel al showcase:
 * etiquetas mono, número héroe en ACENTO (amarillo) con glow, delta real vs.
 * semana previa, regla de medida, tarjetas de stats y la tira del plan con CTA
 * "Entrenar" → En el Ruedo.
 */
export function DashboardRedline({
  progress,
  planDias,
}: {
  progress: ProgressData;
  planDias: PlanDia[];
}) {
  const tp = useTranslations('progress');
  const { summary } = progress;
  const hoy = WEEK[new Date().getDay()];

  // Frecuencia de esta semana vs. días de entreno planificados (para el gauge).
  const entrenosSemana = progress.frecuenciaSemanal[progress.frecuenciaSemanal.length - 1]?.entrenos ?? 0;
  const objetivoSemana = planDias.filter((d) => !d.es_descanso).length;

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_both]">
        <p className="font-mono-metrics text-[10px] uppercase tracking-[0.28em] text-text-secondary">
          {tp('statVolume')} · {tp('thisWeek')}
        </p>
        <div
          className="t-display mt-1 text-[66px] leading-[0.9] text-accent"
          style={{ textShadow: '0 0 44px var(--accent-glow)' }}
        >
          <CountUp to={summary.volumenSemanaKg} />
          <span className="ml-2 font-mono-metrics text-sm text-text-muted">KG</span>
        </div>
        {summary.deltaPct !== null && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono-metrics text-xs"
            style={{
              color: summary.deltaPct >= 0 ? 'var(--accent)' : 'var(--accent-2)',
              borderColor:
                summary.deltaPct >= 0
                  ? 'color-mix(in srgb, var(--accent) 30%, transparent)'
                  : 'color-mix(in srgb, var(--accent-2) 30%, transparent)',
            }}
          >
            {summary.deltaPct >= 0 ? '▲' : '▼'} {summary.deltaPct >= 0 ? '+' : ''}
            {summary.deltaPct}% {tp('vsPrevWeek')}
          </div>
        )}
        {/* Regla de medida (ornamento telemetría) */}
        <div className="mt-4 flex items-end gap-[3px]">
          {Array.from({ length: 16 }).map((_, i) => {
            const major = i % 4 === 0;
            return (
              <span
                key={i}
                className="flex-1 rounded-[1px]"
                style={{
                  height: major ? 18 : 10,
                  background: major ? 'var(--accent)' : 'var(--border-default)',
                  boxShadow: major ? '0 0 8px var(--accent-glow)' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 gap-2.5 animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_.08s_both]">
        <RedStat
          icon={<Dumbbell size={15} strokeWidth={1.5} />}
          value={<CountUp to={summary.totalEntrenos} />}
          label={tp('statWorkouts')}
        />
        <RedStat
          icon={<Flame size={15} strokeWidth={1.5} />}
          value={
            <>
              <CountUp to={summary.rachaSemanas} />
              <span className="ml-1 text-xl text-text-muted">{tp('streakUnit')}</span>
            </>
          }
          label={tp('statStreak')}
          accent2
        />
      </div>

      {/* TIRA DEL PLAN */}
      {planDias.length > 0 && (
        <div className="animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_.12s_both]">
          <p className="mb-2 font-mono-metrics text-[10px] uppercase tracking-[0.22em] text-text-secondary">
            {tp('planWeek')}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border-default">
            {planDias.map((d, i) => {
              const esHoy = d.dia === hoy;
              return (
                <div
                  key={d.dia}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-default)',
                    background: esHoy
                      ? 'linear-gradient(90deg, var(--accent-muted), transparent)'
                      : 'transparent',
                  }}
                >
                  <span
                    className="w-9 font-mono-metrics text-[10px] tracking-[0.1em]"
                    style={{ color: esHoy ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {esHoy ? tp('today').toUpperCase() : ABBR[d.dia] ?? d.dia.slice(0, 3).toUpperCase()}
                  </span>
                  <span
                    className={`flex-1 text-sm ${d.es_descanso ? 'text-text-muted' : 'font-medium text-text-primary'}`}
                  >
                    {d.es_descanso ? tp('restDay') : d.tipo}
                  </span>
                  {!d.es_descanso && (
                    <Link
                      href={`/ruedo/${d.dia}`}
                      className="rounded-lg bg-accent px-3 py-1.5 font-mono-metrics text-[10px] font-semibold uppercase tracking-[0.08em] text-on-accent transition-colors hover:bg-accent-hover"
                    >
                      {tp('train')}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GAUGE DE FRECUENCIA (mismo lenguaje que el timer de descanso) */}
      {objetivoSemana > 0 && (
        <div className="animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_.14s_both]">
          <FrequencyGauge
            done={entrenosSemana}
            goal={objetivoSemana}
            label={`${tp('frequencyTitle')} · ${tp('thisWeek')}`}
            unit={tp('workoutsUnit')}
          />
        </div>
      )}

      {/* GRÁFICAS */}
      <div className="animate-[rise_.6s_cubic-bezier(.2,.7,.2,1)_.18s_both]">
        <ProgressCharts
          volumenPorSesion={progress.volumenPorSesion}
          frecuenciaSemanal={progress.frecuenciaSemanal}
        />
      </div>
    </div>
  );
}

// Geometría del anillo (viewBox 96, r 42), coherente con el timer de descanso.
const GAUGE_R = 42;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;

function FrequencyGauge({
  done,
  goal,
  label,
  unit,
}: {
  done: number;
  goal: number;
  label: string;
  unit: string;
}) {
  const frac = Math.min(done / goal, 1);
  const completo = done >= goal;
  const color = completo ? 'var(--status-success)' : 'var(--accent)';
  const offset = GAUGE_CIRC * (1 - frac);

  return (
    <div
      className="flex items-center gap-4 rounded-2xl border border-border-default p-4"
      style={{ background: 'radial-gradient(120% 120% at 80% 20%, var(--accent-muted), transparent)' }}
    >
      <div className="relative h-[96px] w-[96px] shrink-0">
        <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="48" cy="48" r={GAUGE_R} fill="none" stroke="var(--border-default)" strokeWidth="6" />
          <circle
            cx="48"
            cy="48"
            r={GAUGE_R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRC}
            strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset .6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono-metrics text-lg font-semibold text-text-primary">
            {done}/{goal}
          </span>
        </div>
      </div>
      <div>
        <p className="font-mono-metrics text-[10px] uppercase tracking-[0.18em] text-text-muted">
          {label}
        </p>
        <p className="mt-1 t-display text-base text-text-primary">
          {done} {unit}
        </p>
      </div>
    </div>
  );
}

function RedStat({
  icon,
  value,
  label,
  accent2 = false,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent2?: boolean;
}) {
  const c = accent2 ? 'var(--accent-2)' : 'var(--accent)';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-default bg-bg-elevated/60 p-4">
      <span
        className="absolute right-3.5 top-3.5 h-1.5 w-1.5 rounded-full"
        style={{ background: c, opacity: 0.6 }}
      />
      <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ color: c }}>
        {icon}
      </span>
      <div className="t-display text-3xl leading-none text-text-primary">{value}</div>
      <p className="mt-1.5 font-mono-metrics text-[9px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>
    </div>
  );
}
