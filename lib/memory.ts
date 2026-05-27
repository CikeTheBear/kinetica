import { createClient } from '@/lib/supabase/server';

/**
 * Capa 1 de memoria de Kai: contexto estructurado del usuario.
 * Se construye on-the-fly desde la BD antes de cada llamada al LLM.
 */
export async function getUserContext(userId: string) {
  const supabase = createClient();

  // 1. Perfil
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // 2. Últimos 3 pesajes
  const { data: pesajes } = await supabase
    .from('biometrics_history')
    .select('*')
    .eq('user_id', userId)
    .order('fecha', { ascending: false })
    .limit(3);

  // 3. Métricas de salud últimos 7 días
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: healthMetrics } = await supabase
    .from('health_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', sevenDaysAgo.toISOString().split('T')[0])
    .order('fecha', { ascending: false });

  // 4. Plan semanal activo
  const { data: activePlan } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('estado', 'active')
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .single();

  // 5. Entrenamientos últimos 7 días
  const { data: workouts } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', sevenDaysAgo.toISOString().split('T')[0])
    .order('fecha', { ascending: false });

  // 6. Lesiones activas desde metadata_biometrica
  const lesionesActivas =
    profile?.metadata_biometrica?.lesiones_activas || [];

  // Formatear contexto como bloque de texto para el system prompt
  const parts: string[] = [];

  parts.push('=== ESTADO ACTUAL DEL USUARIO ===');

  if (profile) {
    parts.push(`Perfil: ${JSON.stringify({
      nombre: profile.nombre,
      timezone: profile.timezone,
      onboarding_completed: profile.onboarding_completed,
      metadata: profile.metadata_biometrica,
    })}`);
  }

  if (pesajes && pesajes.length > 0) {
    parts.push(`Últimos 3 pesajes: ${JSON.stringify(pesajes)}`);
  }

  if (healthMetrics && healthMetrics.length > 0) {
    // Agrupar por tipo de métrica para que sea más legible
    const grouped = healthMetrics.reduce((acc, m) => {
      if (!acc[m.tipo_metrica]) acc[m.tipo_metrica] = [];
      acc[m.tipo_metrica].push(m);
      return acc;
    }, {} as Record<string, typeof healthMetrics>);
    parts.push(`Métricas de salud recientes: ${JSON.stringify(grouped)}`);
  }

  if (activePlan) {
    parts.push(`Plan semanal activo: ${JSON.stringify({
      semana_inicio: activePlan.semana_inicio,
      estado: activePlan.estado,
      plan: activePlan.plan_json,
    })}`);
  }

  if (workouts && workouts.length > 0) {
    parts.push(`Entrenamientos últimos 7 días: ${JSON.stringify(workouts)}`);
  }

  if (lesionesActivas.length > 0) {
    parts.push(`Lesiones activas: ${JSON.stringify(lesionesActivas)}`);
  }

  parts.push('==================================');

  // Devolvemos también el flag de onboarding como booleano de primera clase:
  // el system prompt se construye de forma CONDICIONAL con él, en vez de
  // depender de que el modelo "lo encuentre" enterrado dentro del JSON del perfil.
  return {
    context: parts.join('\n'),
    onboardingCompleted: profile?.onboarding_completed === true,
    hasProfile: !!profile,
  };
}

/**
 * Capa 2 de memoria: últimos N mensajes del chat.
 */
export async function getRecentMessages(userId: string, limit: number = 20) {
  const supabase = createClient();

  // Traemos los N MÁS RECIENTES (orden descendente + limit). Si ordenáramos
  // ascending + limit, Postgres devolvería los N más ANTIGUOS de toda la
  // conversación: el modelo nunca vería los últimos mensajes en cuanto el
  // historial superara N. Luego revertimos para entregarlos en orden cronológico.
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !messages) return [];

  return messages.reverse();
}

/**
 * Capa 3 de memoria: resúmenes de largo plazo.
 */
export async function getChatSummaries(userId: string, limit: number = 5) {
  const supabase = createClient();

  const { data: summaries, error } = await supabase
    .from('chat_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !summaries) return [];

  return summaries;
}
