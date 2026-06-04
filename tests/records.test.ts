import { describe, it, expect } from 'vitest';
import {
  estimate1RM,
  buildExerciseRecords,
  type WorkoutLogRow,
} from '@/lib/records';

/**
 * La vista de récords agrega workout_logs por ejercicio: historial cronológico
 * y PRs (peso máx, e1RM máx, reps máx). Blindamos la fórmula de e1RM y la
 * agregación, que es la lógica que puede romperse en silencio (off-by-one en
 * fechas, contar series no completadas, PRs mal calculados).
 */

describe('estimate1RM — fórmula de Epley', () => {
  it('peso × (1 + reps/30), redondeado a 1 decimal', () => {
    // 40 × (1 + 8/30) = 40 × 1.2667 = 50.666... → 50.7
    expect(estimate1RM(40, 8)).toBe(50.7);
  });

  it('1 rep ≈ el propio peso', () => {
    // 100 × (1 + 1/30) = 103.33 → 103.3
    expect(estimate1RM(100, 1)).toBe(103.3);
  });

  it('reps 0 → 0 (no hubo levantamiento)', () => {
    expect(estimate1RM(60, 0)).toBe(0);
  });

  it('peso 0 → 0', () => {
    expect(estimate1RM(0, 10)).toBe(0);
  });

  it('valores no finitos → 0 (defensa ante jsonb malformado)', () => {
    expect(estimate1RM(NaN, 8)).toBe(0);
    expect(estimate1RM(40, NaN)).toBe(0);
  });
});

describe('buildExerciseRecords — agregación por ejercicio', () => {
  it('sin logs: array vacío', () => {
    expect(buildExerciseRecords([])).toEqual([]);
  });

  it('sin series completadas: descarta el ejercicio', () => {
    const logs: WorkoutLogRow[] = [
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 40, reps: 8, completado: false }],
      },
    ];
    expect(buildExerciseRecords(logs)).toEqual([]);
  });

  it('jsonb malformado (sets no es array): no rompe, descarta', () => {
    const logs: WorkoutLogRow[] = [
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: null,
      },
    ];
    expect(buildExerciseRecords(logs)).toEqual([]);
  });

  it('una sesión: PRs y punto de historial con la mejor serie', () => {
    const logs: WorkoutLogRow[] = [
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [
          { serie: 1, peso_kg: 40, reps: 10, completado: true },
          { serie: 2, peso_kg: 45, reps: 6, completado: true },
        ],
      },
    ];
    const [rec] = buildExerciseRecords(logs);
    expect(rec.wgerId).toBe(1);
    expect(rec.nombre).toBe('Press banca');
    // PRs sobre TODAS las series: peso máx 45, reps máx 10.
    expect(rec.pr.pesoMaxKg).toBe(45);
    expect(rec.pr.repsMax).toBe(10);
    // e1RM máx: max(40×(1+10/30)=53.3, 45×(1+6/30)=54) = 54
    expect(rec.pr.e1rmMax).toBe(54);
    // Mejor serie de la sesión = mayor e1RM → la de 45×6 (e1RM 54).
    expect(rec.historial).toHaveLength(1);
    expect(rec.historial[0]).toEqual({
      fecha: '2026-01-05',
      pesoTop: 45,
      reps: 6,
      e1rm: 54,
    });
  });

  it('multi-sesión: historial ordenado por fecha y PRs acumulados', () => {
    const logs: WorkoutLogRow[] = [
      // Se pasa desordenado a propósito: la fecha más reciente primero.
      {
        fecha: '2026-01-12',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 50, reps: 6, completado: true }],
      },
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 45, reps: 6, completado: true }],
      },
    ];
    const [rec] = buildExerciseRecords(logs);
    // Ordenado ascendente por fecha.
    expect(rec.historial.map((p) => p.fecha)).toEqual(['2026-01-05', '2026-01-12']);
    // PR de peso = el más alto entre sesiones.
    expect(rec.pr.pesoMaxKg).toBe(50);
    // e1RM máx = 50×(1+6/30) = 60
    expect(rec.pr.e1rmMax).toBe(60);
  });

  it('mismo ejercicio dos veces el mismo día: junta series en un solo punto', () => {
    const logs: WorkoutLogRow[] = [
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 40, reps: 8, completado: true }],
      },
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 50, reps: 5, completado: true }],
      },
    ];
    const [rec] = buildExerciseRecords(logs);
    // Una sola entrada de historial para esa fecha.
    expect(rec.historial).toHaveLength(1);
    // Mejor serie del día: 50×5 (e1RM 58.3) > 40×8 (e1RM 50.7).
    expect(rec.historial[0].pesoTop).toBe(50);
    expect(rec.pr.pesoMaxKg).toBe(50);
    expect(rec.pr.repsMax).toBe(8);
  });

  it('solo cuenta las series completadas para PRs e historial', () => {
    const logs: WorkoutLogRow[] = [
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [
          { serie: 1, peso_kg: 40, reps: 8, completado: true },
          // Esta NO debe contar aunque tenga más peso.
          { serie: 2, peso_kg: 80, reps: 1, completado: false },
        ],
      },
    ];
    const [rec] = buildExerciseRecords(logs);
    expect(rec.pr.pesoMaxKg).toBe(40);
    expect(rec.historial[0].pesoTop).toBe(40);
  });

  it('varios ejercicios: ordenados por e1RM máx descendente', () => {
    const logs: WorkoutLogRow[] = [
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 2,
        ejercicio_nombre: 'Curl bíceps',
        sets: [{ serie: 1, peso_kg: 15, reps: 12, completado: true }],
      },
      {
        fecha: '2026-01-05',
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Sentadilla',
        sets: [{ serie: 1, peso_kg: 100, reps: 5, completado: true }],
      },
    ];
    const recs = buildExerciseRecords(logs);
    expect(recs.map((r) => r.nombre)).toEqual(['Sentadilla', 'Curl bíceps']);
  });
});
