import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase con la SERVICE_ROLE key: bypassa RLS. SOLO server-side.
 *
 * Necesario para escribir en tablas globales como `exercises_cache`, cuya
 * política RLS es `USING(false) WITH CHECK(false)` (escritura bloqueada para
 * el cliente de sesión/anon). La sincronización del catálogo de wger usa este
 * cliente. NUNCA exponer la service_role key al navegador ni prefijarla con
 * NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el cliente admin.'
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
