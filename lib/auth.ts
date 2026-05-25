import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Obtiene el usuario autenticado en Server Components.
 * Si no hay sesión, retorna null (el llamador decide si redirigir).
 */
export async function getUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Obtiene el usuario autenticado en Server Components.
 * Si no hay sesión, redirige a /login inmediatamente.
 * Usar en rutas protegidas.
 */
export async function requireUser(locale: string = 'es') {
  const user = await getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return user;
}
