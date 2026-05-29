import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RuedoView } from '@/components/ruedo/ruedo-view';
import { DIAS_SEMANA, getFechaForDia, type DiaSemana } from '@/lib/workout';

/**
 * Página "En el Ruedo" — ejecución del entrenamiento de un día concreto.
 * Ruta: /[locale]/ruedo/[dia]  (p.ej. /es/ruedo/lunes)
 *
 * Server component: valida sesión, carga el plan activo, localiza el día y
 * delega el registro interactivo en <RuedoView> (cliente). Si algo no cuadra
 * (sin plan, día inválido o día de descanso) volvemos a la pestaña Plan.
 */
export default async function RuedoPage({
  params: { locale, dia },
}: {
  params: { locale: string; dia: string };
}) {
  await requireUser(locale);

  // Validar que el día de la URL es uno de los días canónicos.
  if (!DIAS_SEMANA.includes(dia as DiaSemana)) {
    redirect(`/${locale}/plan`);
  }
  const diaParam = dia as DiaSemana;

  // Cargar el plan activo del usuario.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: plan } = await supabase
    .from('weekly_plans')
    .select('id, semana_inicio, plan_json')
    .eq('user_id', user!.id)
    .eq('estado', 'active')
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .single();

  if (!plan) {
    redirect(`/${locale}/plan`);
  }

  // Localizar el día dentro del plan.
  const diaPlan = plan.plan_json?.dias?.find(
    (d: { dia: string }) => d.dia === diaParam
  );

  // Sin día, sin ejercicios o día de descanso → no hay nada que ejecutar.
  if (!diaPlan || diaPlan.es_descanso || !diaPlan.ejercicios?.length) {
    redirect(`/${locale}/plan`);
  }

  const fecha = getFechaForDia(plan.semana_inicio, diaParam);

  return (
    <RuedoView
      planId={plan.id}
      fecha={fecha}
      dia={{
        dia: diaPlan.dia,
        tipo: diaPlan.tipo,
        ejercicios: diaPlan.ejercicios,
      }}
    />
  );
}
