import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { computeProgress, type WorkoutLogRow } from '@/lib/progress';
import { DashboardView, type PlanDia } from '@/components/dashboard/dashboard-view';

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await requireUser(locale);

  // No redirigimos si el onboarding está incompleto: el DashboardView muestra
  // una invitación amable a hablar con Kai (decisión de UX consensuada).
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

  // Plan activo: para la tira de "hoy / próximos días" del Dashboard.
  const { data: plan } = await supabase
    .from('weekly_plans')
    .select('plan_json')
    .eq('user_id', user.id)
    .eq('estado', 'active')
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .single();

  const rows = (logs ?? []) as WorkoutLogRow[];
  const planDias: PlanDia[] = (plan?.plan_json?.dias ?? []).map(
    (d: { dia: string; tipo: string; es_descanso: boolean }) => ({
      dia: d.dia,
      tipo: d.tipo,
      es_descanso: d.es_descanso,
    })
  );

  return (
    <DashboardView
      onboardingCompleted={profile?.onboarding_completed === true}
      hasLogs={rows.length > 0}
      progress={computeProgress(rows)}
      planDias={planDias}
    />
  );
}
