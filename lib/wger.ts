/**
 * Cliente para la API de wger.de (catálogo de ejercicios open source).
 * Docs: https://wger.de/api/v2/  ·  Idiomas: 2 = inglés, 4 = español.
 *
 * Usamos el endpoint /exerciseinfo/, que devuelve cada ejercicio con sus
 * traducciones (array `translations`), categoría, equipamiento e imágenes.
 * El `id` del exerciseinfo es el identificador estable que guardamos como
 * `wger_id` en exercises_cache y que referencian los planes.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const WGER_BASE_URL = 'https://wger.de/api/v2';
const LANG_ES = 4;
const LANG_EN = 2;

/** Entrada normalizada lista para guardar en la tabla exercises_cache. */
export interface ExerciseCacheEntry {
  wger_id: number;
  nombre_es: string | null;
  nombre_en: string | null;
  descripcion_es: string | null;
  descripcion_en: string | null;
  grupo_muscular: string | null;
  equipamiento: string | null;
  imagen_url: string | null;
}

interface WgerTranslation {
  language: number;
  name: string;
  description: string;
}

interface WgerExerciseInfo {
  id: number;
  category: { name: string } | null;
  equipment: { name: string }[];
  images: { image: string }[];
  translations: WgerTranslation[];
}

/** Quita etiquetas HTML de las descripciones de wger (vienen como HTML). */
function stripHtml(html: string | undefined | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function mapExercise(ex: WgerExerciseInfo): ExerciseCacheEntry {
  const es = ex.translations?.find((t) => t.language === LANG_ES);
  const en = ex.translations?.find((t) => t.language === LANG_EN);

  return {
    wger_id: ex.id,
    nombre_es: es?.name || null,
    nombre_en: en?.name || null,
    descripcion_es: stripHtml(es?.description),
    descripcion_en: stripHtml(en?.description),
    grupo_muscular: ex.category?.name || null,
    equipamiento: ex.equipment?.map((e) => e.name).join(', ') || null,
    imagen_url: ex.images?.[0]?.image || null,
  };
}

/**
 * Descarga el catálogo completo de ejercicios de wger.de, paginando.
 * Solo conserva ejercicios que tengan al menos un nombre (es o en).
 */
export async function fetchExerciseCatalog(): Promise<ExerciseCacheEntry[]> {
  const all: ExerciseCacheEntry[] = [];
  let url: string | null = `${WGER_BASE_URL}/exerciseinfo/?limit=100`;

  while (url) {
    const res: Response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`wger API error: ${res.status} ${res.statusText}`);
    }
    const data: { next: string | null; results: WgerExerciseInfo[] } = await res.json();

    for (const ex of data.results) {
      const entry = mapExercise(ex);
      if (entry.nombre_es || entry.nombre_en) all.push(entry);
    }
    url = data.next;
  }

  return all;
}

/**
 * Sincroniza la tabla exercises_cache con el catálogo de wger.de.
 *
 * Usa el cliente admin (service_role) porque la RLS de exercises_cache bloquea
 * la escritura desde el cliente de sesión. Pensado para ejecutarse de forma
 * ocasional (manual o por cron), NO en cada request. Hace upsert por lotes
 * sobre la PK wger_id, así que es idempotente y refresca datos existentes.
 */
export async function syncExercisesCache(): Promise<{ total: number; errors: number }> {
  const catalog = await fetchExerciseCatalog();
  const supabase = createAdminClient();

  const BATCH = 100;
  let errors = 0;

  for (let i = 0; i < catalog.length; i += BATCH) {
    const batch = catalog.slice(i, i + BATCH).map((e) => ({
      ...e,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('exercises_cache')
      .upsert(batch, { onConflict: 'wger_id' });

    if (error) {
      console.error('[wger sync] error en lote:', error.message);
      errors += batch.length;
    }
  }

  return { total: catalog.length, errors };
}

// --- Catálogo filtrado para la generación de planes ---

/**
 * Mapeo: categoría de equipamiento de Kinética (metadata_biometrica.equipamiento)
 * → nombres de equipment de wger accesibles con ese equipamiento.
 *
 * Es acumulativo en intención: cada nivel "tiene" lo de los inferiores. Las
 * categorías con acceso total (gimnasio/home gym/otro) no filtran nada (ver
 * SIN_FILTRO abajo). El peso corporal está siempre disponible para todos.
 */
const EQUIPMENT_MAP: Record<string, string[]> = {
  peso_corporal_solo: ['none (bodyweight exercise)', 'Gym mat'],
  bandas_elasticas: ['none (bodyweight exercise)', 'Gym mat', 'Resistance band'],
  mancuernas_basicas: [
    'none (bodyweight exercise)',
    'Gym mat',
    'Dumbbell',
    'Kettlebell',
    'Bench',
    'Incline bench',
  ],
};

/** Categorías que dan acceso a TODO el catálogo (no se filtra). */
const SIN_FILTRO = new Set(['gimnasio_comercial', 'home_gym_completo', 'otro']);

export interface CatalogEntry {
  wger_id: number;
  nombre: string;
  grupo_muscular: string | null;
}

/**
 * Devuelve el catálogo de ejercicios accesible para el equipamiento del usuario,
 * en formato compacto para pasárselo al LLM. Lee de exercises_cache (lectura
 * pública por RLS, cliente de sesión). Si no hay equipamiento, asume peso corporal.
 */
export async function getCatalogForUser(equipamiento: string[]): Promise<CatalogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('exercises_cache')
    .select('wger_id, nombre_es, nombre_en, grupo_muscular, equipamiento');

  if (error || !data) return [];

  const cats = equipamiento && equipamiento.length > 0 ? equipamiento : ['peso_corporal_solo'];
  const sinFiltro = cats.some((c) => SIN_FILTRO.has(c));

  const permitidos = new Set<string>();
  for (const c of cats) {
    (EQUIPMENT_MAP[c] || []).forEach((e) => permitidos.add(e.toLowerCase()));
  }

  const rows = data as Array<{
    wger_id: number;
    nombre_es: string | null;
    nombre_en: string | null;
    grupo_muscular: string | null;
    equipamiento: string | null;
  }>;

  const filtered = rows.filter((row) => {
    if (sinFiltro) return true;
    // Ejercicios sin equipo declarado = accesibles (peso corporal).
    if (!row.equipamiento) return true;
    const equip = row.equipamiento.toLowerCase();
    for (const p of Array.from(permitidos)) {
      if (equip.includes(p)) return true;
    }
    return false;
  });

  return filtered.map((row) => ({
    wger_id: row.wger_id,
    nombre: row.nombre_es || row.nombre_en || `#${row.wger_id}`,
    grupo_muscular: row.grupo_muscular,
  }));
}
