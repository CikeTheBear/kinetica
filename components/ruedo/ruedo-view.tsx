'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/navigation';
import {
  parseRepsObjetivo,
  type EjercicioRegistro,
  type SerieRegistro,
} from '@/lib/workout';
import { ExerciseTracker } from './exercise-tracker';
import { RestTimer } from './rest-timer';

// Forma de un ejercicio tal como viene en el plan_json (subconjunto que usamos).
interface EjercicioPlan {
  wger_id: number;
  nombre: string;
  sets: number;
  reps_objetivo: string;
  peso_sugerido_kg?: number;
  rpe_objetivo?: number;
  descanso_seg?: number;
  notas_kai?: string;
}

interface DiaPlan {
  dia: string;
  tipo: string;
  ejercicios: EjercicioPlan[];
}

// Descanso por defecto si el plan no especifica descanso_seg para el ejercicio.
const DESCANSO_DEFAULT_SEG = 90;

/**
 * Vista principal de "En el Ruedo": registra el entrenamiento de un día.
 *
 * - Inicializa las series desde los objetivos del plan (sets, reps, peso sugerido).
 * - Autosalva un borrador en localStorage para sobrevivir a recargas.
 * - Al completar una serie, lanza el timer de descanso del ejercicio.
 * - "Finalizar" persiste todo en workout_logs vía POST /api/workout/log.
 */
export function RuedoView({
  planId,
  fecha,
  dia,
}: {
  planId: string;
  fecha: string;
  dia: DiaPlan;
}) {
  const t = useTranslations('ruedo');
  const router = useRouter();

  // Clave del borrador en localStorage, única por plan + día.
  const draftKey = `ruedo:${planId}:${dia.dia}`;
  // Firma de los ejercicios: si el plan se regeneró, el borrador viejo no aplica.
  const signature = useMemo(
    () => dia.ejercicios.map((e) => e.wger_id).join('-'),
    [dia.ejercicios]
  );

  const [ejercicios, setEjercicios] = useState<EjercicioRegistro[]>(() =>
    buildInitialRegistro(dia.ejercicios)
  );
  const [restKey, setRestKey] = useState(0);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar desde el borrador al montar (solo si la firma coincide).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as {
          signature: string;
          ejercicios: EjercicioRegistro[];
        };
        if (draft.signature === signature && Array.isArray(draft.ejercicios)) {
          setEjercicios(draft.ejercicios);
        }
      }
    } catch {
      // Borrador corrupto: lo ignoramos y seguimos con el inicial.
    }
    setHydrated(true);
    // Solo al montar; draftKey/signature son estables para este día.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosalvar el borrador en cada cambio (tras la hidratación inicial).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ signature, ejercicios }));
    } catch {
      // Sin localStorage (modo privado, etc.): no es crítico, seguimos.
    }
  }, [ejercicios, hydrated, draftKey, signature]);

  function updateSerie(
    ejIndex: number,
    serieIndex: number,
    patch: Partial<SerieRegistro>
  ) {
    setEjercicios((prev) =>
      prev.map((ej, i) =>
        i !== ejIndex
          ? ej
          : {
              ...ej,
              series: ej.series.map((s, j) =>
                j === serieIndex ? { ...s, ...patch } : s
              ),
            }
      )
    );
  }

  function toggleComplete(ejIndex: number, serieIndex: number) {
    const serie = ejercicios[ejIndex].series[serieIndex];
    const willComplete = !serie.completado;
    updateSerie(ejIndex, serieIndex, { completado: willComplete });

    // Al COMPLETAR (no al desmarcar), disparar el descanso del ejercicio.
    if (willComplete) {
      const descanso =
        dia.ejercicios[ejIndex].descanso_seg ?? DESCANSO_DEFAULT_SEG;
      setRestSeconds(descanso);
      setRestKey((k) => k + 1); // fuerza remount → reinicia el timer
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const response = await fetch('/api/workout/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ weekly_plan_id: planId, fecha, ejercicios }),
      });

      if (response.ok) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* noop */
        }
        setSaved(true);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || t('saveError'));
      }
    } catch {
      alert(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  // Progreso: series completadas sobre el total.
  const totalSeries = ejercicios.reduce((acc, ej) => acc + ej.series.length, 0);
  const completadas = ejercicios.reduce(
    (acc, ej) => acc + ej.series.filter((s) => s.completado).length,
    0
  );

  // Pantalla de confirmación tras guardar.
  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <CheckCircle2 size={56} className="mb-4 text-status-success" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-text-primary">{t('savedTitle')}</h2>
        <p className="mt-2 max-w-xs text-text-secondary">{t('savedBody')}</p>
        <button
          onClick={() => router.push('/plan')}
          className="mt-6 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
        >
          {t('backToPlan')}
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Cabecera */}
      <div className="mb-4">
        <Link
          href="/plan"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          {t('backToPlan')}
        </Link>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold capitalize text-text-primary">
              {dia.dia}
            </h1>
            <p className="text-sm text-text-secondary">{dia.tipo}</p>
          </div>
          <span className="font-mono-metrics text-sm text-text-muted">
            {completadas}/{totalSeries} {t('seriesDone')}
          </span>
        </div>
      </div>

      {/* Ejercicios */}
      <div className="space-y-3">
        {ejercicios.map((ej, ejIndex) => (
          <ExerciseTracker
            key={ej.wger_id}
            ejercicio={ej}
            target={{
              reps_objetivo: dia.ejercicios[ejIndex].reps_objetivo,
              peso_sugerido_kg: dia.ejercicios[ejIndex].peso_sugerido_kg,
              rpe_objetivo: dia.ejercicios[ejIndex].rpe_objetivo,
              notas_kai: dia.ejercicios[ejIndex].notas_kai,
            }}
            onChangeSerie={(serieIndex, patch) =>
              updateSerie(ejIndex, serieIndex, patch)
            }
            onToggleComplete={(serieIndex) => toggleComplete(ejIndex, serieIndex)}
          />
        ))}
      </div>

      {/* Finalizar */}
      <button
        onClick={handleFinish}
        disabled={saving}
        className="mt-6 w-full rounded-lg bg-accent py-3.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? t('saving') : t('finishWorkout')}
      </button>

      {/* Timer de descanso flotante */}
      <AnimatePresence>
        {restSeconds !== null && (
          <RestTimer
            key={restKey}
            seconds={restSeconds}
            onDismiss={() => setRestSeconds(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Construye el registro inicial de series desde los objetivos del plan:
 * tantas series como `sets`, pre-rellenadas con el peso sugerido y las reps
 * objetivo parseadas.
 */
function buildInitialRegistro(ejercicios: EjercicioPlan[]): EjercicioRegistro[] {
  return ejercicios.map((ej) => ({
    wger_id: ej.wger_id,
    nombre: ej.nombre,
    series: Array.from({ length: Math.max(1, ej.sets) }, (_, i) => ({
      serie: i + 1,
      peso_kg: ej.peso_sugerido_kg ?? 0,
      reps: parseRepsObjetivo(ej.reps_objetivo),
      completado: false,
    })),
  }));
}
