'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Marca el disclaimer médico como aceptado para el usuario actual.
 * Actualiza user_profiles.disclaimer_accepted_at con la fecha/hora actual.
 */
export async function acceptDisclaimer() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Usuario no autenticado');
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({ disclaimer_accepted_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('Error al aceptar disclaimer:', error);
    throw new Error('No se pudo guardar la aceptación del disclaimer');
  }

  revalidatePath('/', 'layout');
}
