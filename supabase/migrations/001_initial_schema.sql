-- ============================================================
-- Kinética — Initial Schema (Sprint 1 Foundation)
-- Fuente: PRD v2 + kinetica_setup.md
-- ============================================================

-- --------------------------------------------------------------
-- 1. USER PROFILES
-- Perfil extendido del usuario, ligado a auth.users de Supabase.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  id                   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre               text NOT NULL,
  email                text,
  timezone             text NOT NULL DEFAULT 'America/Caracas',
  onboarding_completed boolean DEFAULT false,
  metadata_biometrica  jsonb,
  locale               text NOT NULL DEFAULT 'es',
  disclaimer_accepted_at timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- --------------------------------------------------------------
-- 2. BIOMETRICS HISTORY
-- Snapshots de composición corporal (agnóstico al proveedor).
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biometrics_history (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fecha                  date NOT NULL,
  hora                   time,
  peso_kg                numeric(5,2),
  imc                    numeric(4,2),
  porcentaje_grasa       numeric(4,2),
  porcentaje_musculo     numeric(4,2),
  porcentaje_agua        numeric(4,2),
  porcentaje_proteina    numeric(4,2),
  masa_osea_kg           numeric(4,2),
  masa_libre_grasa_kg    numeric(5,2),
  masa_grasa_kg          numeric(5,2),
  grasa_visceral         numeric(4,1),
  metabolismo_basal_kcal integer,
  edad_metabolica        integer,
  tipo_cuerpo            text,
  origen_datos           text NOT NULL,
  raw_data               jsonb,
  created_at             timestamptz DEFAULT now(),

  UNIQUE (user_id, fecha, hora, origen_datos)
);

ALTER TABLE biometrics_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_biometrics" ON biometrics_history
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 3. HEALTH METRICS
-- Métricas de salud y recuperación de wearables / Apple Health.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fecha           date NOT NULL,
  hora            time,
  tipo_metrica    text NOT NULL,
  valor_numerico  numeric(10,3),
  valor_texto     text,
  unidad          text,
  origen_datos    text NOT NULL,
  metadata        jsonb,
  created_at      timestamptz DEFAULT now(),

  UNIQUE (user_id, fecha, hora, tipo_metrica, origen_datos)
);

ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_health_metrics" ON health_metrics
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 4. WEEKLY PLANS
-- Plan semanal de entrenamiento generado por Kai.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  semana_inicio   date NOT NULL,
  estado          text NOT NULL DEFAULT 'active',
  plan_json       jsonb NOT NULL,
  notas_bloque    text,
  created_at      timestamptz DEFAULT now(),

  UNIQUE (user_id, semana_inicio)
);

ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_plans" ON weekly_plans
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 5. WORKOUT LOGS
-- Registro real de entrenamientos ejecutados.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  weekly_plan_id      uuid REFERENCES weekly_plans(id) ON DELETE SET NULL,
  fecha               date NOT NULL,
  ejercicio_wger_id   integer,
  ejercicio_nombre    text NOT NULL,
  sets                jsonb NOT NULL,
  notas_usuario       text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_workouts" ON workout_logs
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 6. CHAT MESSAGES
-- Historial conversacional con Kai.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_messages" ON chat_messages
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 7. CHAT SUMMARIES
-- Memoria de largo plazo (Capa 3 de memoria de Kai).
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  resumen         text NOT NULL,
  rango_inicio    timestamptz NOT NULL,
  rango_fin       timestamptz NOT NULL,
  mensaje_count   integer,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE chat_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_summaries" ON chat_summaries
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 8. EXERCISE VIDEO CACHE
-- Cache de videos de YouTube por ejercicio.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_video_cache (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio_wger_id   integer,
  ejercicio_nombre    text NOT NULL,
  youtube_video_id    text NOT NULL,
  title               text,
  duration_seconds    integer,
  calidad_validada    boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),

  UNIQUE (ejercicio_wger_id)
);

-- Esta tabla es global (no por usuario), pero no permite escritura
-- directa desde el frontend. Las Edge Functions la manejan.
ALTER TABLE exercise_video_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_video_cache" ON exercise_video_cache
  FOR SELECT USING (true);

CREATE POLICY "service_role_write_video_cache" ON exercise_video_cache
  FOR ALL USING (false) WITH CHECK (false);

-- --------------------------------------------------------------
-- 9. PROACTIVE JOBS LOG
-- Bitácora de jobs programados para evitar duplicados.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proactive_jobs_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_type     text NOT NULL,
  ejecutado_at timestamptz DEFAULT now(),
  resultado    jsonb
);

ALTER TABLE proactive_jobs_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_jobs_log" ON proactive_jobs_log
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 10. PUSH SUBSCRIPTIONS
-- Subscripciones Web Push por dispositivo (no estaba en PRD v2).
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz DEFAULT now(),
  last_used_at  timestamptz DEFAULT now(),

  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- --------------------------------------------------------------
-- 11. EXERCISES CACHE
-- Cache local de ejercicios de wger.de en es/en.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises_cache (
  wger_id           integer PRIMARY KEY,
  nombre_es         text,
  nombre_en         text,
  descripcion_es    text,
  descripcion_en    text,
  grupo_muscular    text,
  equipamiento      text,
  imagen_url        text,
  updated_at        timestamptz DEFAULT now()
);

-- Global, lectura pública, escritura solo desde Edge Functions / cron.
ALTER TABLE exercises_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_exercises_cache" ON exercises_cache
  FOR SELECT USING (true);

CREATE POLICY "service_role_write_exercises_cache" ON exercises_cache
  FOR ALL USING (false) WITH CHECK (false);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger: crear user_profile automáticamente cuando se crea un usuario en auth.users.
-- Esto es más confiable que hacerlo desde el cliente/Server Action porque:
-- 1. Funciona incluso si email confirmation está activado (sin sesión todavía).
-- 2. Funciona con cualquier método de registro (OAuth, magic link, admin API).
-- 3. Es atómico: ocurre en la misma transacción que la creación del auth user.
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

-- Solo crear el trigger si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;
