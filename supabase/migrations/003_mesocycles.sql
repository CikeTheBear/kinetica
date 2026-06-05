-- 003_mesocycles.sql
-- Mesociclos: bloques de N semanas con un arco de progresión + semana de descarga
-- (deload). La SEMANA sigue siendo la unidad atómica (weekly_plans); el mesociclo
-- solo la orquesta. Todo es ADITIVO y retrocompatible: las semanas sueltas
-- existentes (sin mesocycle_id) siguen funcionando igual.

-- --------------------------------------------------------------
-- Tabla de mesociclos
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mesocycles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nombre        text NOT NULL,                 -- "Hipertrofia · Bloque 1"
  objetivo      text,                          -- hipertrofia | fuerza | ...
  num_semanas   integer NOT NULL DEFAULT 4,    -- típico 4-6
  semana_actual integer NOT NULL DEFAULT 1,    -- 1..num_semanas (semana en curso)
  semana_inicio date NOT NULL,                 -- lunes de la semana 1 del bloque
  estado        text NOT NULL DEFAULT 'active', -- active | completed | archived
  notas_bloque  text,                          -- el arco del bloque (lógica de progresión + deload)
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE mesocycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_mesocycles" ON mesocycles
  FOR ALL USING (auth.uid() = user_id);

-- update_updated_at_column() ya existe (migración 001).
CREATE TRIGGER mesocycles_updated_at
  BEFORE UPDATE ON mesocycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------
-- weekly_plans: vínculo OPCIONAL al mesociclo
-- mesocycle_id null  → semana suelta (comportamiento previo intacto).
-- --------------------------------------------------------------
ALTER TABLE weekly_plans
  ADD COLUMN IF NOT EXISTS mesocycle_id  uuid REFERENCES mesocycles(id) ON DELETE CASCADE;
ALTER TABLE weekly_plans
  ADD COLUMN IF NOT EXISTS semana_indice integer;   -- posición dentro del bloque (1..N)
ALTER TABLE weekly_plans
  ADD COLUMN IF NOT EXISTS es_deload     boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_weekly_plans_mesocycle ON weekly_plans(mesocycle_id);
