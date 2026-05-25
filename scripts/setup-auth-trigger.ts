/**
 * Script para crear el trigger de auth.users en Supabase Cloud.
 * El SQL Editor a veces no tiene permisos para tocar auth.users,
 * pero una conexión directa con service_role sí.
 *
 * Uso:
 *   npx tsx scripts/setup-auth-trigger.ts
 *
 * Requiere la variable SERVICE_ROLE_KEY en .env.local o como env var.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { Client } from 'pg';

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY');
    console.error('   Agrégala a .env.local o ejecuta:');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=tu-key npx tsx scripts/setup-auth-trigger.ts');
    process.exit(1);
  }

  // Connection string directa a la BD de Supabase
  const connectionString = `postgresql://postgres:${serviceRoleKey}@db.focbdmounzgaujtirvno.supabase.co:5432/postgres`;

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('🔌 Conectado a Supabase');

    // Crear función
    await client.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO public.user_profiles (id, nombre, email, onboarding_completed, metadata_biometrica, locale)
        VALUES (
          NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
          NEW.email,
          false,
          '{}',
          'es'
        )
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    console.log('✅ Función handle_new_user() creada');

    // Eliminar trigger si existe
    await client.query(`
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    `);
    console.log('🧹 Trigger anterior eliminado (si existía)');

    // Crear trigger
    await client.query(`
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_new_user();
    `);
    console.log('✅ Trigger on_auth_user_created creado en auth.users');

    // Verificar
    const result = await client.query(`
      SELECT tgname, tgrelid::regclass AS table_name
      FROM pg_trigger
      WHERE tgname = 'on_auth_user_created';
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verificado: trigger existe en', result.rows[0].table_name);
    } else {
      console.error('❌ El trigger no se encontró después de crearlo');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
