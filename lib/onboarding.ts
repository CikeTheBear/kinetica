import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Verifica si el usuario ha completado el onboarding.
 * Si no, redirige a la página de onboarding.
 * Usar en rutas protegidas del dashboard.
 */
export async function requireOnboarding(userId: string, locale: string = 'es') {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .single();

  if (!profile?.onboarding_completed) {
    redirect(`/${locale}/coach?onboarding=true`);
  }
}
