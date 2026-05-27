'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Registra un nuevo usuario en Supabase Auth.
 * Se ejecuta como Server Action desde el formulario de registro.
 *
 * El `locale` se pasa desde el form (useLocale) para construir el redirect
 * en el idioma activo y no forzar siempre español.
 */
export async function signUp(formData: FormData) {
  const supabase = createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const nombre = formData.get('nombre') as string;
  // Locale activo enviado como campo oculto del form. Fallback a 'es'.
  const locale = (formData.get('locale') as string) || 'es';

  if (!email || !password || !nombre) {
    return { error: 'Todos los campos son obligatorios.' };
  }

  if (password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  }

  const { error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nombre,
      },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  // NOTA: No insertamos manualmente en user_profiles. El trigger SQL
  // `handle_new_user` (migración 002) ya crea la fila tras el INSERT en
  // auth.users, cogiendo el nombre de raw_user_meta_data->>'nombre' (que
  // enviamos arriba en options.data) y el email/defaults. Lo hace con
  // ON CONFLICT (id) DO NOTHING, así que el insert manual era redundante
  // y colisionaba; lo eliminamos para evitar el error silenciado.

  revalidatePath('/', 'layout');
  return { success: true, redirectTo: `/${locale}/login` };
}

/**
 * Inicia sesión con email y contraseña.
 * Retorna success en vez de redirect para evitar loops de redirección.
 * El `locale` se pasa desde el form para redirigir en el idioma activo.
 */
export async function signIn(formData: FormData) {
  const supabase = createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const locale = (formData.get('locale') as string) || 'es';

  if (!email || !password) {
    return { error: 'Email y contraseña son obligatorios.' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  // Destino post-login unificado con el guard de login/page.tsx: /dashboard.
  return { success: true, redirectTo: `/${locale}/dashboard` };
}

/**
 * Cierra la sesión del usuario.
 * El `locale` se pasa como argumento desde el componente (useLocale).
 */
export async function signOut(locale: string = 'es') {
  const supabase = createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  return { success: true, redirectTo: `/${locale}/login` };
}
