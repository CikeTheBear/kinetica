'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Clock, ChevronDown, ChevronUp, Flame, Play, Repeat, Layers, ArrowRight } from 'lucide-react';
import { Link } from '@/navigation';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/page-container';
import { groupBySuperset } from '@/lib/workout';

interface PlanSemanal {
  id: string;
  semana_inicio: string;
  notas_bloque: string | null;
  plan_json: {
    dias: Array<{
      dia: string;
      tipo: string;
      es_descanso: boolean;
      duracion_estimada_min?: number;
      ejercicios: Array<{
        wger_id: number;
        nombre: string;
        sets: number;
        reps_objetivo: string;
        peso_sugerido_kg?: number;
        rpe_objetivo?: number;
        descanso_seg?: number;
        notas_kai?: string;
        grupo?: string;
      }>;
    }>;
  };
}

// Info mínima del mesociclo activo que necesita la UI del plan.
interface MesocycleInfo {
  id: string;
  nombre: string;
  objetivo: string | null;
  num_semanas: number;
  semana_actual: number;
}

export function WeeklyPlanView() {
  const t = useTranslations('plan');
  const locale = useLocale();
  const [plan, setPlan] = useState<PlanSemanal | null>(null);
  const [mesocycle, setMesocycle] = useState<MesocycleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockObjetivo, setBlockObjetivo] = useState('');
  const [blockSemanas, setBlockSemanas] = useState(4);

  useEffect(() => {
    fetchActivePlan();
    fetchMesocycle();
  }, []);

  async function fetchActivePlan() {
    try {
      // no-store: nunca servir un plan cacheado por el navegador/SW.
      const response = await fetch('/api/plan/active', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setPlan(data.plan);
      }
    } catch (error) {
      console.error('Error fetching plan:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMesocycle() {
    try {
      const response = await fetch('/api/mesocycle', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setMesocycle(data.mesocycle ?? null);
      }
    } catch {
      // No es crítico: si falla, la UI cae al modo "semana suelta".
    }
  }

  // Helper común a todas las acciones que devuelven un plan (generar/regenerar
  // semana suelta, empezar bloque, avanzar/regenerar semana del bloque).
  async function runPlanAction(url: string, body?: unknown) {
    setGenerating(true);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPlan(data.plan);
        await fetchMesocycle(); // el bloque pudo cambiar (empezar/avanzar)
      } else {
        alert(data.error || t('errorGenerating'));
      }
    } catch {
      alert(t('errorGenerating'));
    } finally {
      setGenerating(false);
    }
  }

  // Semana suelta (sin bloque) o primer plan desde el empty state.
  const handleGeneratePlan = () => runPlanAction('/api/plan/generate');
  // Regenerar: si hay bloque activo, regenera la semana del bloque; si no, suelta.
  const handleRegenerate = () =>
    mesocycle
      ? runPlanAction('/api/mesocycle/week', { action: 'regenerate' })
      : runPlanAction('/api/plan/generate');
  const handleAdvanceWeek = () => runPlanAction('/api/mesocycle/week', { action: 'advance' });
  const handleStartBlock = async () => {
    await runPlanAction('/api/mesocycle', {
      objetivo: blockObjetivo.trim() || undefined,
      numSemanas: blockSemanas,
    });
    setShowBlockForm(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-text-secondary">{t('loading')}</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <Dumbbell size={48} className="mb-4 text-text-muted" />
        <h2 className="t-display text-2xl text-text-primary">{t('title')}</h2>
        <p className="mt-2 max-w-xs text-text-secondary">{t('emptyState')}</p>
        <button
          onClick={handleGeneratePlan}
          disabled={generating}
          className="mt-6 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {generating ? t('generating') : t('generateButton')}
        </button>
      </div>
    );
  }

  const dias = plan.plan_json.dias;
  // Derivados del bloque para la UI.
  const isDeload = mesocycle
    ? mesocycle.num_semanas >= 2 && mesocycle.semana_actual === mesocycle.num_semanas
    : false;
  const canAdvance = mesocycle ? mesocycle.semana_actual < mesocycle.num_semanas : false;

  return (
    <PageContainer>
      {/* Header del plan */}
      <div className="mb-4 rounded-xl bg-bg-elevated p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="t-display text-xl text-text-primary">{t('title')}</h2>
            <p className="mt-1 font-mono-metrics text-[10px] uppercase tracking-[0.16em] text-text-muted">
              {t('weekOf')} {formatDate(plan.semana_inicio, locale)}
            </p>
            {/* Contexto del bloque (mesociclo) */}
            {mesocycle && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 font-mono-metrics text-[10px] font-semibold uppercase tracking-wide text-accent">
                  <Layers size={11} strokeWidth={2} />
                  {t('blockWeek', {
                    semana: mesocycle.semana_actual,
                    total: mesocycle.num_semanas,
                  })}
                </span>
                {isDeload && (
                  <span className="rounded bg-accent-2/15 px-2 py-0.5 font-mono-metrics text-[10px] font-semibold uppercase tracking-wide text-accent-2">
                    {t('deload')}
                  </span>
                )}
                <span className="truncate text-[11px] text-text-muted">{mesocycle.nombre}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="rounded-lg bg-bg-overlay px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-overlay/70 disabled:opacity-50"
            >
              {generating ? '...' : t('regenerateButton')}
            </button>
            {mesocycle ? (
              canAdvance && (
                <button
                  onClick={handleAdvanceWeek}
                  disabled={generating}
                  className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {t('nextWeek')}
                  <ArrowRight size={14} strokeWidth={2} />
                </button>
              )
            ) : (
              <button
                onClick={() => setShowBlockForm((v) => !v)}
                disabled={generating}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {t('startBlock')}
              </button>
            )}
          </div>
        </div>

        {/* Form para empezar un bloque (solo cuando no hay uno activo) */}
        {!mesocycle && showBlockForm && (
          <div className="mt-3 space-y-2 rounded-lg border border-border-subtle bg-bg-overlay/40 p-3">
            <input
              value={blockObjetivo}
              onChange={(e) => setBlockObjetivo(e.target.value)}
              placeholder={t('blockObjectivePlaceholder')}
              className="w-full rounded bg-bg-base px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary">{t('blockWeeks')}</label>
              <select
                value={blockSemanas}
                onChange={(e) => setBlockSemanas(Number(e.target.value))}
                className="rounded bg-bg-base px-2 py-1 text-sm text-text-primary outline-none"
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                onClick={handleStartBlock}
                disabled={generating}
                className="ml-auto rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {generating ? t('starting') : t('startBlock')}
              </button>
            </div>
          </div>
        )}

        {plan.notas_bloque && (
          <p className="mt-3 text-sm text-text-secondary">{plan.notas_bloque}</p>
        )}
      </div>

      {/* Lista de días */}
      <div className="space-y-2">
        {dias.map((dia) => (
          <DayCard
            key={dia.dia}
            dia={dia}
            isExpanded={expandedDay === dia.dia}
            onToggle={() =>
              setExpandedDay(expandedDay === dia.dia ? null : dia.dia)
            }
          />
        ))}
      </div>
    </PageContainer>
  );
}

function DayCard({
  dia,
  isExpanded,
  onToggle,
}: {
  dia: PlanSemanal['plan_json']['dias'][0];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('plan');
  const isRestDay = dia.es_descanso;

  // Agrupar por superserie, llevando el índice global (1..N) para la numeración
  // de cada ejercicio sin importar cómo queden agrupados.
  let acc = 0;
  const grupos = groupBySuperset(dia.ejercicios).map((g) => {
    const start = acc;
    acc += g.ejercicios.length;
    return { grupo: g.grupo, ejercicios: g.ejercicios, start };
  });

  return (
    <motion.div
      layout
      className={cn(
        'rounded-xl border p-4',
        isRestDay
          ? 'border-border-subtle bg-bg-overlay/50'
          : 'border-border-default bg-bg-elevated'
      )}
    >
      {/* Header del día */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              isRestDay ? 'bg-bg-overlay text-text-muted' : 'bg-accent/10 text-accent'
            )}
          >
            {isRestDay ? (
              <span className="text-lg">💤</span>
            ) : (
              <Flame size={18} />
            )}
          </div>
          <div>
            <h3 className="t-display text-lg capitalize text-text-primary">{dia.dia}</h3>
            <p className="font-mono-metrics text-[10px] uppercase tracking-[0.12em] text-text-secondary">
              {dia.tipo}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dia.duracion_estimada_min && (
            <span className="flex items-center gap-1 font-mono-metrics text-xs text-text-muted">
              <Clock size={12} />
              {dia.duracion_estimada_min}min
            </span>
          )}
          {isExpanded ? (
            <ChevronUp size={18} className="text-text-muted" />
          ) : (
            <ChevronDown size={18} className="text-text-muted" />
          )}
        </div>
      </button>

      {/* Ejercicios del día */}
      <AnimatePresence>
        {isExpanded && !isRestDay && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
              {grupos.map((group, gi) =>
                group.grupo && group.ejercicios.length > 1 ? (
                  // Superserie: ejercicios enmarcados bajo una etiqueta "Superserie A".
                  <div
                    key={`g-${gi}`}
                    className="rounded-lg border border-accent/30 bg-accent/5 p-2"
                  >
                    <p className="mb-1.5 flex items-center gap-1.5 px-1 font-mono-metrics text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                      <Repeat size={12} strokeWidth={2} />
                      {t('superset', { grupo: group.grupo })}
                    </p>
                    <div className="space-y-1.5">
                      {group.ejercicios.map((ejercicio, i) => (
                        <ExerciseRow key={i} ejercicio={ejercicio} index={group.start + i} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <ExerciseRow
                    key={`s-${gi}`}
                    ejercicio={group.ejercicios[0]}
                    index={group.start}
                  />
                )
              )}

              {/* CTA para entrar a "En el Ruedo" y ejecutar este día. */}
              <Link
                href={`/ruedo/${dia.dia}`}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
              >
                <Play size={16} strokeWidth={2} />
                {t('trainButton')}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ExerciseRow({
  ejercicio,
  index,
}: {
  ejercicio: PlanSemanal['plan_json']['dias'][0]['ejercicios'][0];
  index: number;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-bg-overlay p-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
        {index + 1}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{ejercicio.nombre}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="font-mono-metrics">
            {ejercicio.sets}x{ejercicio.reps_objetivo}
          </span>
          {ejercicio.peso_sugerido_kg && (
            <span className="font-mono-metrics text-accent">
              {ejercicio.peso_sugerido_kg}kg
            </span>
          )}
          {ejercicio.rpe_objetivo && (
            <span className="rounded bg-bg-base px-1.5 py-0.5 text-text-muted">
              RPE {ejercicio.rpe_objetivo}
            </span>
          )}
          {ejercicio.descanso_seg && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {Math.floor(ejercicio.descanso_seg / 60)}min
            </span>
          )}
        </div>
        {ejercicio.notas_kai && (
          <p className="mt-1 text-xs text-text-muted">{ejercicio.notas_kai}</p>
        )}
      </div>
    </div>
  );
}

function formatDate(dateString: string, locale: string): string {
  const date = new Date(dateString);
  // Mapear el locale de la app al BCP-47 que espera toLocaleDateString.
  const intlLocale = locale === 'en' ? 'en-US' : 'es-ES';
  return date.toLocaleDateString(intlLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
