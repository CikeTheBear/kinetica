import { useTranslations } from 'next-intl';
import { ArrowRight, Dumbbell, Flame, TrendingUp } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/navigation';
import { computeProgress, type ProgressData, type WorkoutLogRow } from '@/lib/progress';
import { ProgressCharts } from '@/components/dashboard/progress-charts';

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await requireUser(locale);

  // No redirigimos si el onboarding está incompleto: dejamos que el usuario
  // llegue al dashboard y le mostramos una invitación amable a hablar con Kai.
  // (Decisión de UX: preferimos un prompt acogedor a un redirect forzado.)
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();

  // Datos de progreso a partir de los entrenamientos registrados ("En el Ruedo").
  const { data: logs } = await supabase
    .from('workout_logs')
    .select('fecha, ejercicio_nombre, sets')
    .eq('user_id', user.id);

  const rows = (logs ?? []) as WorkoutLogRow[];
  const progress = computeProgress(rows);
  const hasLogs = rows.length > 0;

  return (
    <DashboardPageContent
      onboardingCompleted={profile?.onboarding_completed === true}
      hasLogs={hasLogs}
      progress={progress}
    />
  );
}

function DashboardPageContent({
  onboardingCompleted,
  hasLogs,
  progress,
}: {
  onboardingCompleted: boolean;
  hasLogs: boolean;
  progress: ProgressData;
}) {
  const t = useTranslations('dashboard');

  return (
    <div className="flex flex-col px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary">{t('title')}</h1>

      {!onboardingCompleted && (
        <Link
          href="/coach?onboarding=true"
          className="mt-6 flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent-muted p-5 transition-colors hover:bg-accent/10"
        >
          <div className="flex-1">
            <p className="font-semibold text-text-primary">{t('onboardingTitle')}</p>
            <p className="mt-1 text-sm text-text-secondary">{t('onboardingBody')}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent">
              {t('onboardingCta')}
              <ArrowRight size={16} strokeWidth={2} />
            </span>
          </div>
        </Link>
      )}

      <ProgressSection hasLogs={hasLogs} progress={progress} />
    </div>
  );
}

function ProgressSection({
  hasLogs,
  progress,
}: {
  hasLogs: boolean;
  progress: ProgressData;
}) {
  const t = useTranslations('progress');

  if (!hasLogs) {
    return (
      <div className="mt-8 flex flex-col items-center rounded-2xl border border-border-subtle bg-bg-elevated px-4 py-10 text-center">
        <TrendingUp size={40} className="mb-3 text-text-muted" strokeWidth={1.5} />
        <h2 className="font-semibold text-text-primary">{t('emptyTitle')}</h2>
        <p className="mt-1 max-w-xs text-sm text-text-secondary">{t('emptyBody')}</p>
      </div>
    );
  }

  const { summary } = progress;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-text-primary">{t('title')}</h2>

      {/* Tarjetas de resumen */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatCard
          icon={<Dumbbell size={16} strokeWidth={1.5} />}
          value={String(summary.totalEntrenos)}
          label={t('statWorkouts')}
        />
        <StatCard
          icon={<TrendingUp size={16} strokeWidth={1.5} />}
          value={formatKg(summary.volumenTotalKg)}
          label={t('statVolume')}
        />
        <StatCard
          icon={<Flame size={16} strokeWidth={1.5} />}
          value={`${summary.rachaSemanas} ${t('streakUnit')}`}
          label={t('statStreak')}
        />
      </div>

      <ProgressCharts
        volumenPorSesion={progress.volumenPorSesion}
        frecuenciaSemanal={progress.frecuenciaSemanal}
      />
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-3 text-center">
      <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
        {icon}
      </span>
      <p className="font-mono-metrics text-lg font-semibold text-text-primary">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

/** Formatea kg de forma compacta: 12500 → "12.5k", 850 → "850". */
function formatKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return String(kg);
}
