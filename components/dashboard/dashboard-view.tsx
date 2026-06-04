'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, Trophy, TrendingUp } from 'lucide-react';
import { Link } from '@/navigation';
import type { ProgressData } from '@/lib/progress';
import { PageContainer } from '@/components/page-container';
import { DashboardRedline } from './dashboard-redline';
import { DashboardKinetic } from './dashboard-kinetic';

/** Día del plan activo, para la tira de "hoy / próximos" del Dashboard. */
export interface PlanDia {
  dia: string;
  tipo: string;
  es_descanso: boolean;
}

/**
 * Orquestador del Dashboard. Los estados compartidos (banner de onboarding,
 * empty state) se renderizan una vez; cuando hay datos, renderiza las DOS
 * variantes bespoke (Redline / Kinetic) y CSS muestra la del tema activo
 * (.only-redline / .only-kinetic). Misma data para ambas, sin doble fetch.
 */
export function DashboardView({
  onboardingCompleted,
  hasLogs,
  progress,
  planDias = [],
}: {
  onboardingCompleted: boolean;
  hasLogs: boolean;
  progress: ProgressData;
  planDias?: PlanDia[];
}) {
  const t = useTranslations('dashboard');
  const tp = useTranslations('progress');
  const tr = useTranslations('records');

  return (
    <PageContainer>
      <p className="font-mono-metrics text-[11px] uppercase tracking-[0.25em] text-text-muted">
        {tp('title')}
      </p>

      {!onboardingCompleted && (
        <Link
          href="/coach?onboarding=true"
          className="mt-5 flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent-muted p-5 transition-colors hover:bg-accent/10"
        >
          <div className="flex-1">
            <p className="t-display text-lg text-text-primary">{t('onboardingTitle')}</p>
            <p className="mt-1 text-sm text-text-secondary">{t('onboardingBody')}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent">
              {t('onboardingCta')}
              <ArrowRight size={16} strokeWidth={2} />
            </span>
          </div>
        </Link>
      )}

      {onboardingCompleted && !hasLogs && (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-border-subtle bg-bg-elevated px-4 py-12 text-center">
          <TrendingUp size={40} className="mb-3 text-text-muted" strokeWidth={1.5} />
          <h2 className="t-display text-lg text-text-primary">{tp('emptyTitle')}</h2>
          <p className="mt-1 max-w-xs text-sm text-text-secondary">{tp('emptyBody')}</p>
        </div>
      )}

      {hasLogs && (
        <div className="mt-4">
          {/* Dos variantes bespoke; CSS muestra la del tema activo. */}
          <div className="only-redline">
            <DashboardRedline progress={progress} planDias={planDias} />
          </div>
          <div className="only-kinetic">
            <DashboardKinetic progress={progress} />
          </div>

          {/* Acceso a la vista de récords por ejercicio (PRs + e1RM). Como la
              bottom-nav no tiene hueco para más ítems, se enlaza desde aquí. */}
          <Link
            href="/progress"
            className="mt-4 flex items-center gap-3 rounded-xl border border-border-default bg-bg-elevated p-4 transition-colors hover:bg-accent/5"
          >
            <Trophy size={20} strokeWidth={1.5} className="text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary">{tr('cardTitle')}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{tr('cardBody')}</p>
            </div>
            <ArrowRight size={18} strokeWidth={1.5} className="shrink-0 text-text-muted" />
          </Link>
        </div>
      )}
    </PageContainer>
  );
}
