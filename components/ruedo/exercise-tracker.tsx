'use client';

import { Check, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { RPE_NIVELES } from '@/lib/workout';
import type { EjercicioRegistro, SerieRegistro } from '@/lib/workout';

// Incrementos de los botones +/-. 2.5 kg es el salto típico de discos pequeños.
const PESO_STEP = 2.5;
const REPS_STEP = 1;

interface TargetInfo {
  reps_objetivo: string;
  peso_sugerido_kg?: number;
  rpe_objetivo?: number;
  notas_kai?: string;
}

/**
 * Tarjeta de un ejercicio durante el entrenamiento: muestra los objetivos del
 * plan y permite registrar cada serie (peso + reps) con botones grandes +/- y
 * marcarla como completada.
 *
 * Es presentacional: el estado vive en ruedo-view; aquí solo emitimos cambios.
 */
export function ExerciseTracker({
  ejercicio,
  target,
  onChangeSerie,
  onToggleComplete,
}: {
  ejercicio: EjercicioRegistro;
  target: TargetInfo;
  onChangeSerie: (serieIndex: number, patch: Partial<SerieRegistro>) => void;
  onToggleComplete: (serieIndex: number) => void;
}) {
  const t = useTranslations('ruedo');

  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
      {/* Cabecera: nombre + objetivos del plan */}
      <div className="mb-3">
        <h3 className="t-display text-lg text-text-primary">{ejercicio.nombre}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="font-mono-metrics">
            {ejercicio.series.length}×{target.reps_objetivo}
          </span>
          {target.peso_sugerido_kg != null && (
            <span className="font-mono-metrics text-accent">
              {t('suggested')} {target.peso_sugerido_kg}kg
            </span>
          )}
          {target.rpe_objetivo != null && (
            <span className="rounded bg-bg-overlay px-1.5 py-0.5 text-text-muted">
              RPE {target.rpe_objetivo}
            </span>
          )}
        </div>
        {target.notas_kai && (
          <p className="mt-1 text-xs text-text-muted">{target.notas_kai}</p>
        )}
      </div>

      {/* Cabecera de columnas */}
      <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
        <span>{t('colSet')}</span>
        <span className="text-center">{t('colWeight')}</span>
        <span className="text-center">{t('colReps')}</span>
        <span />
      </div>

      {/* Filas de series */}
      <div className="space-y-2">
        {ejercicio.series.map((serie, index) => (
          <div
            key={serie.serie}
            className={cn(
              'grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 rounded-lg p-1 transition-colors',
              serie.completado ? 'bg-status-success/10' : 'bg-bg-overlay/40'
            )}
          >
            {/* Nº de serie */}
            <span className="text-center font-mono-metrics text-sm font-medium text-text-secondary">
              {serie.serie}
            </span>

            {/* Peso */}
            <Stepper
              value={serie.peso_kg}
              unit="kg"
              onDecrement={() =>
                onChangeSerie(index, {
                  peso_kg: Math.max(0, +(serie.peso_kg - PESO_STEP).toFixed(1)),
                })
              }
              onIncrement={() =>
                onChangeSerie(index, {
                  peso_kg: +(serie.peso_kg + PESO_STEP).toFixed(1),
                })
              }
            />

            {/* Reps */}
            <Stepper
              value={serie.reps}
              onDecrement={() =>
                onChangeSerie(index, { reps: Math.max(0, serie.reps - REPS_STEP) })
              }
              onIncrement={() =>
                onChangeSerie(index, { reps: serie.reps + REPS_STEP })
              }
            />

            {/* Completar */}
            <button
              onClick={() => onToggleComplete(index)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                serie.completado
                  ? 'bg-status-success text-on-accent'
                  : 'bg-bg-overlay text-text-muted hover:text-text-primary'
              )}
              aria-label={t('completeSet')}
              aria-pressed={serie.completado}
            >
              <Check size={18} strokeWidth={serie.completado ? 2.5 : 1.5} />
            </button>

            {/* Selector de RPE real: aparece SOLO al completar la serie.
                Contextual (valoras el esfuerzo tras hacerla) y opcional. Ocupa
                toda la fila del grid (col-span-full) bajo los controles. */}
            {serie.completado && (
              <div className="col-span-full mt-0.5 flex items-center gap-1.5 px-1">
                <span className="font-mono-metrics text-[10px] uppercase tracking-wide text-text-muted">
                  {t('rpePrompt')}
                </span>
                {RPE_NIVELES.map((nivel) => (
                  <button
                    key={nivel.id}
                    type="button"
                    // Toggle: re-tocar el nivel activo lo desmarca (rpe → undefined).
                    onClick={() =>
                      onChangeSerie(index, {
                        rpe: serie.rpe === nivel.valor ? undefined : nivel.valor,
                      })
                    }
                    aria-pressed={serie.rpe === nivel.valor}
                    className={cn(
                      'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                      serie.rpe === nivel.valor
                        ? 'bg-accent text-on-accent'
                        : 'bg-bg-base text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {t(`rpe_${nivel.id}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Control numérico grande con botones [-] valor [+]. Pensado para usarse a
 * dedo durante el entreno (botones de 40px de alto).
 */
function Stepper({
  value,
  unit,
  onDecrement,
  onIncrement,
}: {
  value: number;
  unit?: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 rounded-lg bg-bg-base px-1">
      <button
        onClick={onDecrement}
        className="flex h-10 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary"
        aria-label="-"
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <span className="font-mono-metrics text-sm font-semibold text-text-primary">
        {value}
        {unit && <span className="ml-0.5 text-xs text-text-muted">{unit}</span>}
      </span>
      <button
        onClick={onIncrement}
        className="flex h-10 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary"
        aria-label="+"
      >
        <Plus size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
