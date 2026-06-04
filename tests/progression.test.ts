import { describe, it, expect } from 'vitest';
import {
  progressionSignal,
  buildProgressionSummary,
  type PlanJsonParcial,
  type WorkoutLogRow,
} from '@/lib/progression';

/**
 * El loop de progresión decide si Kai sube/mantiene/baja la carga según el RPE
 * real vs el objetivo. Blindamos los umbrales de la señal y la agregación de
 * plan-vs-realidad, que son la lógica que de verdad puede romperse en silencio.
 */

describe('progressionSignal — umbrales de RPE', () => {
  it('sin RPE real: no hay señal de esfuerzo', () => {
    expect(progressionSignal(8, null)).toMatch(/sin RPE/i);
  });

  it('sin RPE objetivo: solo reporta el RPE real', () => {
    expect(progressionSignal(undefined, 6)).toBe('RPE real 6');
  });

  it('RPE real bastante por debajo del objetivo: SUBIR carga', () => {
    // diff = 6 - 8 = -2  (<= -1.5)
    expect(progressionSignal(8, 6)).toMatch(/SUBIR/);
  });

  it('frontera -1.5: cuenta como sobró margen (SUBIR)', () => {
    // diff = 6.5 - 8 = -1.5  (<= -1.5)
    expect(progressionSignal(8, 6.5)).toMatch(/SUBIR/);
  });

  it('RPE real por encima del objetivo: MANTENER o reducir', () => {
    // diff = 9 - 8 = +1  (>= 1)
    expect(progressionSignal(8, 9)).toMatch(/MANTENER/);
  });

  it('al fallo (RPE 10) sobre objetivo 8: MANTENER o reducir', () => {
    expect(progressionSignal(8, 10)).toMatch(/MANTENER/);
  });

  it('cerca del objetivo: progresión ligera o mantener', () => {
    // diff = 7.5 - 8 = -0.5  (entre -1.5 y +1)
    expect(progressionSignal(8, 7.5)).toMatch(/en objetivo/i);
  });
});

describe('buildProgressionSummary — agregación plan vs realidad', () => {
  const planBanca: PlanJsonParcial = {
    dias: [
      {
        ejercicios: [
          {
            wger_id: 1,
            nombre: 'Press banca',
            sets: 4,
            reps_objetivo: '6-8',
            peso_sugerido_kg: 40,
            rpe_objetivo: 8,
          },
        ],
      },
    ],
  };

  it('sin logs: devuelve null (nada que resumir)', () => {
    expect(buildProgressionSummary(planBanca, [])).toBeNull();
  });

  it('logs sin series completadas: devuelve null', () => {
    const logs: WorkoutLogRow[] = [
      {
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 40, reps: 8, completado: false, rpe: 6 }],
      },
    ];
    expect(buildProgressionSummary(planBanca, logs)).toBeNull();
  });

  it('agrega peso de trabajo (máx), reps (media) y RPE real (media)', () => {
    const logs: WorkoutLogRow[] = [
      {
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [
          { serie: 1, peso_kg: 40, reps: 8, completado: true, rpe: 6 },
          { serie: 2, peso_kg: 42.5, reps: 7, completado: true, rpe: 6 },
        ],
      },
    ];
    const out = buildProgressionSummary(planBanca, logs)!;
    expect(out).toContain('Press banca');
    expect(out).toContain('plan 6-8 reps @ 40kg (RPE obj 8)');
    // pesoTrabajo = max(40, 42.5) = 42.5; reps media round((8+7)/2)=8; rpe media = 6
    expect(out).toContain('hizo 2 series ~42.5kg ×8, RPE real 6');
    // RPE real 6 vs objetivo 8 → señal de subir
    expect(out).toMatch(/SUBIR/);
  });

  it('junta las series de un ejercicio entrenado en varios días', () => {
    const logs: WorkoutLogRow[] = [
      {
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 40, reps: 8, completado: true, rpe: 8 }],
      },
      {
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 40, reps: 8, completado: true, rpe: 8 }],
      },
    ];
    const out = buildProgressionSummary(planBanca, logs)!;
    expect(out).toContain('hizo 2 series');
  });

  it('ejercicio que no está en el plan: lo marca como sin objetivo', () => {
    const logs: WorkoutLogRow[] = [
      {
        ejercicio_wger_id: 99,
        ejercicio_nombre: 'Curl improvisado',
        sets: [{ serie: 1, peso_kg: 15, reps: 12, completado: true, rpe: 7 }],
      },
    ];
    const out = buildProgressionSummary(planBanca, logs)!;
    expect(out).toContain('sin objetivo en plan');
  });

  it('series sin RPE marcado: lo refleja como no registrado', () => {
    const logs: WorkoutLogRow[] = [
      {
        ejercicio_wger_id: 1,
        ejercicio_nombre: 'Press banca',
        sets: [{ serie: 1, peso_kg: 40, reps: 8, completado: true }],
      },
    ];
    const out = buildProgressionSummary(planBanca, logs)!;
    expect(out).toContain('RPE no registrado');
    expect(out).toMatch(/sin RPE/i);
  });
});
