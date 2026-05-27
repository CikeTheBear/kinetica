/**
 * Decide de forma DETERMINÍSTICA si el perfil ya tiene los 5 datos mínimos
 * de onboarding. La clave del proyecto: NO dependemos del LLM para esta decisión
 * (el modelo no llamaba `mark_onboarding_complete` de forma fiable). El backend
 * recalcula esto cada vez que se guarda un dato y marca el onboarding solo.
 *
 * Los 5 datos (mapeados al schema canónico de metadata_biometrica):
 *   1. Objetivo        → objetivo_principal
 *   2. Datos básicos   → edad + altura_cm + peso_inicial_kg
 *   3. Disponibilidad  → dias_disponibles
 *   4. Equipamiento    → equipamiento (array no vacío)
 *   5. Lesiones        → la KEY lesiones_activas existe (un array vacío [] es
 *                        respuesta válida: significa "el usuario confirmó que no
 *                        tiene lesiones", no "no preguntado").
 */
export function isOnboardingDataComplete(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;

  const tieneObjetivo = typeof m.objetivo_principal === 'string' && m.objetivo_principal !== '';
  const tieneDatosBasicos =
    typeof m.edad === 'number' &&
    typeof m.altura_cm === 'number' &&
    typeof m.peso_inicial_kg === 'number';
  const tieneDisponibilidad = typeof m.dias_disponibles === 'number';
  const tieneEquipamiento = Array.isArray(m.equipamiento) && m.equipamiento.length > 0;
  const lesionesRevisadas = 'lesiones_activas' in m && Array.isArray(m.lesiones_activas);

  return (
    tieneObjetivo &&
    tieneDatosBasicos &&
    tieneDisponibilidad &&
    tieneEquipamiento &&
    lesionesRevisadas
  );
}
