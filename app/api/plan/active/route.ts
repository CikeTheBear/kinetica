import { createClient } from '@/lib/supabase/server';

/**
 * API route: GET /api/plan/active
 * Devuelve el plan semanal activo del usuario autenticado.
 */
export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: plan, error } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('estado', 'active')
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .single();

  if (error || !plan) {
    return Response.json({ plan: null });
  }

  return Response.json({ plan });
}
