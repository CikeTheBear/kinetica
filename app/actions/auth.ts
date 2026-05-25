'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Registra un nuevo usuario en Supabase Auth y crea su perfil.
 * Se ejecuta como Server Action desde el formulario de registro.
 */
export async function signUp(formData: FormData) {
  const supabase = createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const nombre = formData.get('nombre') as string;

  if (!email || !password || !nombre) {
    return { error: 'Todos los campos son obligatorios.' };
  }

  if (password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
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

  // Crear user_profile directamente (ya que email confirmation está desactivado
  // para v1, la sesión se establece inmediatamente).
  if (authData.user) {
    const { error: profileError } = await supabase.from('user_profiles').insert({
      id: authData.user.id,
      nombre,
      email,
      onboarding_completed: false,
      metadata_biometrica: {},
      locale: 'es',
    });

    if (profileError) {
      console.error('Error creando user_profile:', profileError);
    }
  }

  revalidatePath('/', 'layout');
  redirect('/es/login');
}

/**
 * Inicia sesión con email y contraseña.
 */
export async function signIn(formData: FormData) {
  const supabase = createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

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
  // Redirigir directo a /es/coach para evitar chain de redirects (dashboard → coach)
  redirect('/es/coach');
}

/**
 * Cierra la sesión del usuario.
 */
export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}
