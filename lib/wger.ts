import { createClient } from '@/lib/supabase/server';

/**
 * Cliente para la API de wger.de (catálogo de ejercicios open source).
 * Documentación: https://wger.de/api/v2/
 *
 * wger soporta múltiples idiomas mediante el parámetro `language`:
 * - language=2 → inglés
 * - language=4 → español
 *
 * Si no hay traducción, fallback automático a inglés.
 */

const WGER_BASE_URL = 'https://wger.de/api/v2';

interface WgerExercise {
  id: number;
  name: string;
  description: string;
  category: { name: string };
  muscles: { name: string }[];
  muscles_secondary: { name: string }[];
  equipment: { name: string }[];
  images: { image: string }[];
}

/**
 * Busca ejercicios en wger.de por idioma.
 * @param languageId 2 = inglés, 4 = español
 */
export async function fetchExercisesFromWger(
  languageId: number = 4
): Promise<WgerExercise[]> {
  const response = await fetch(
    `${WGER_BASE_URL}/exercise/?language=${languageId}&limit=100`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`wger API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Obtiene un ejercicio específico de wger con detalles completos.
 */
export async function fetchExerciseById(id: number): Promise<WgerExercise | null> {
  const response = await fetch(`${WGER_BASE_URL}/exercise/${id}/`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) return null;
  return response.json();
}

/**
 * Sincroniza el cache local de ejercicios con wger.de.
 * Descarga ejercicios en español e inglés y los guarda en `exercises_cache`.
 */
export async function syncExercisesCache(): Promise<{
  inserted: number;
  updated: number;
  errors: number;
}> {
  const supabase = createClient();

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    // Descargar en español e inglés en paralelo
    const [esExercises, enExercises] = await Promise.all([
      fetchExercisesFromWger(4), // español
      fetchExercisesFromWger(2), // inglés
    ]);

    // Crear un mapa por ID para merge fácil
    const esMap = new Map(esExercises.map((e) => [e.id, e]));
    const enMap = new Map(enExercises.map((e) => [e.id, e]));

    // Todos los IDs únicos
    const allIds = Array.from(new Set([
      ...Array.from(esMap.keys()),
      ...Array.from(enMap.keys()),
    ]));

    for (const id of allIds) {
      const es = esMap.get(id);
      const en = enMap.get(id);

      // Tomar datos de cualquiera que exista
      const exercise = es || en;
      if (!exercise) continue;

      const cacheEntry = {
        wger_id: id,
        nombre_es: es?.name || null,
        nombre_en: en?.name || null,
        descripcion_es: es?.description || null,
        descripcion_en: en?.description || null,
        grupo_muscular: exercise.category?.name || null,
        equipamiento: exercise.equipment?.map((e) => e.name).join(', ') || null,
        imagen_url: exercise.images?.[0]?.image || null,
        updated_at: new Date().toISOString(),
      };

      // Upsert: insertar o actualizar
      const { error } = await supabase
        .from('exercises_cache')
        .upsert(cacheEntry, { onConflict: 'wger_id' });

      if (error) {
        console.error(`Error caching exercise ${id}:`, error);
        errors++;
      } else {
        // Determinar si es insert o update es tricky con upsert
        // Simplemente contamos como "procesado"
        inserted++;
      }
    }
  } catch (error) {
    console.error('Error syncing exercises cache:', error);
    throw error;
  }

  return { inserted, updated, errors };
}

/**
 * Busca ejercicios en el cache local por nombre (búsqueda parcial).
 */
export async function searchExercisesInCache(
  query: string,
  locale: string = 'es'
): Promise<any[]> {
  const supabase = createClient();

  const nameColumn = locale === 'es' ? 'nombre_es' : 'nombre_en';

  const { data, error } = await supabase
    .from('exercises_cache')
    .select('*')
    .ilike(nameColumn, `%${query}%`)
    .limit(20);

  if (error) {
    console.error('Error searching exercises:', error);
    return [];
  }

  return data || [];
}
