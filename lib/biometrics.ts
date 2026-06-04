/**
 * Lógica PURA de registro biométrico manual (pesaje y composición corporal).
 *
 * Sigue el patrón de lib/progress.ts: este módulo NO importa nada server-only
 * (Supabase / next/headers), así que es seguro tanto en Server Components como en
 * client components y tests. El wrapper de BD vive aparte en
 * lib/biometrics-server.ts (importa lib/supabase/server) para no arrastrar
 * código de servidor al bundle del cliente.
 */

/**
 * Fila de biometrics_history en la forma que nos interesa para las gráficas y
 * el resumen. Solo el subconjunto de columnas que consume la UI; el resto de
 * campos de composición se guardan pero no se grafican (de momento).
 */
export interface BiometricEntry {
  fecha: string; // YYYY-MM-DD
  peso_kg: number | null;
  imc?: number | null;
  porcentaje_grasa?: number | null;
  porcentaje_musculo?: number | null;
}

/** Un punto de la serie de evolución del peso para el gráfico. */
export interface PuntoPeso {
  fecha: string; // YYYY-MM-DD
  pesoKg: number;
}

export interface WeightTrend {
  pesoActualKg: number | null; // último peso registrado (por fecha)
  deltaKg: number | null; // diferencia vs. el pesaje anterior (null si no hay previo)
  serie: PuntoPeso[]; // serie ordenada cronológicamente para el gráfico
}

/**
 * IMC (índice de masa corporal) = peso (kg) / altura (m)².
 *
 * Función PURA. Devuelve null ante cualquier input inválido (no numérico, <= 0,
 * NaN, Infinity) en lugar de lanzar, para que el llamador no tenga que envolver
 * en try/catch. Redondea a 2 decimales (coincide con numeric(4,2) de la tabla).
 *
 * @param pesoKg   peso corporal en kilogramos
 * @param alturaCm altura en centímetros (se convierte a metros internamente)
 */
export function computeIMC(
  pesoKg: number | null | undefined,
  alturaCm: number | null | undefined
): number | null {
  // Validación defensiva: ambos deben ser números finitos y positivos.
  if (
    typeof pesoKg !== 'number' ||
    typeof alturaCm !== 'number' ||
    !Number.isFinite(pesoKg) ||
    !Number.isFinite(alturaCm) ||
    pesoKg <= 0 ||
    alturaCm <= 0
  ) {
    return null;
  }

  const alturaM = alturaCm / 100;
  const imc = pesoKg / (alturaM * alturaM);

  // Redondeo a 2 decimales. Math.round sobre x100 evita errores de coma flotante.
  return Math.round(imc * 100) / 100;
}

/**
 * Resume la evolución del peso a partir de los pesajes del usuario.
 *
 * Función PURA. Ordena por fecha ascendente (ignora pesajes sin peso), y devuelve
 * el último peso, el delta respecto al pesaje inmediatamente anterior, y la serie
 * lista para el gráfico. Si no hay pesajes con peso válido, todo es null/vacío.
 *
 * Nota: las fechas YYYY-MM-DD ordenan lexicográficamente igual que cronológicamente,
 * así que un sort de strings basta (mismo truco que lib/progress.ts).
 */
export function summarizeWeightTrend(entries: BiometricEntry[]): WeightTrend {
  if (!Array.isArray(entries)) {
    return { pesoActualKg: null, deltaKg: null, serie: [] };
  }

  // Quedarnos solo con pesajes que tienen un peso numérico válido.
  const conPeso = entries.filter(
    (e): e is BiometricEntry & { peso_kg: number } =>
      typeof e.peso_kg === 'number' && Number.isFinite(e.peso_kg) && e.peso_kg > 0
  );

  // Orden cronológico ascendente.
  const ordenados = [...conPeso].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const serie: PuntoPeso[] = ordenados.map((e) => ({
    fecha: e.fecha,
    pesoKg: e.peso_kg,
  }));

  if (serie.length === 0) {
    return { pesoActualKg: null, deltaKg: null, serie };
  }

  const pesoActualKg = serie[serie.length - 1].pesoKg;
  const deltaKg =
    serie.length >= 2
      ? // Redondeo a 1 decimal: los deltas de peso de báscula no necesitan más.
        Math.round((pesoActualKg - serie[serie.length - 2].pesoKg) * 10) / 10
      : null;

  return { pesoActualKg, deltaKg, serie };
}
