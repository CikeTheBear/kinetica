'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Clock, ChevronDown, ChevronUp, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      }>;
    }>;
  };
}

export function WeeklyPlanView() {
  const t = useTranslations('plan');
  const locale = useLocale();
  const [plan, setPlan] = useState<PlanSemanal | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchActivePlan();
  }, []);

  async function fetchActivePlan() {
    try {
      const response = await fetch('/api/plan/active');
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

  async function handleGeneratePlan() {
    setGenerating(true);
    try {
      const response = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setPlan(data.plan);
      } else {
        const error = await response.json();
        alert(error.error || t('errorGenerating'));
      }
    } catch (error) {
      alert(t('errorGenerating'));
    } finally {
      setGenerating(false);
    }
  }

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
        <h2 className="text-xl font-semibold text-text-primary">{t('title')}</h2>
        <p className="mt-2 max-w-xs text-text-secondary">{t('emptyState')}</p>
        <button
          onClick={handleGeneratePlan}
          disabled={generating}
          className="mt-6 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-[#0A0E14] transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {generating ? t('generating') : t('generateButton')}
        </button>
      </div>
    );
  }

  const dias = plan.plan_json.dias;

  return (
    <div className="px-4 py-4">
      {/* Header del plan */}
      <div className="mb-4 rounded-xl bg-bg-elevated p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('title')}</h2>
            <p className="mt-1 text-xs text-text-muted">
              {t('weekOf')} {formatDate(plan.semana_inicio, locale)}
            </p>
          </div>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-[#0A0E14] transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {generating ? '...' : t('regenerateButton')}
          </button>
        </div>
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
    </div>
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
  const isRestDay = dia.es_descanso;

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
            <h3 className="font-medium capitalize text-text-primary">{dia.dia}</h3>
            <p className="text-xs text-text-secondary">{dia.tipo}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dia.duracion_estimada_min && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
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
              {dia.ejercicios.map((ejercicio, index) => (
                <ExerciseRow
                  key={index}
                  ejercicio={ejercicio}
                  index={index}
                />
              ))}
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
