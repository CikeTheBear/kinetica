import { describe, it, expect } from 'vitest';
import { isOnboardingDataComplete } from '@/lib/onboarding';

/**
 * Esta función es el corazón del onboarding: decide de forma determinística
 * (sin el LLM) cuándo el perfil tiene los 5 datos mínimos. Si falla, el chat de
 * Kai volvería al bucle de onboarding que nos trajo hasta aquí, así que la
 * blindamos con casos explícitos.
 */

// Perfil completo de referencia: cumple los 5 requisitos.
const perfilCompleto = {
  objetivo_principal: 'hipertrofia',
  edad: 36,
  altura_cm: 178,
  peso_inicial_kg: 78.5,
  dias_disponibles: 4,
  equipamiento: ['gimnasio_comercial'],
  lesiones_activas: [],
};

describe('isOnboardingDataComplete', () => {
  it('devuelve true con los 5 datos y lesiones_activas como array vacío', () => {
    expect(isOnboardingDataComplete(perfilCompleto)).toBe(true);
  });

  it('devuelve true cuando hay lesiones activas registradas', () => {
    const conLesion = {
      ...perfilCompleto,
      lesiones_activas: [{ zona: 'hombro_derecho', severidad: 'leve' }],
    };
    expect(isOnboardingDataComplete(conLesion)).toBe(true);
  });

  it('devuelve false con perfil vacío', () => {
    expect(isOnboardingDataComplete({})).toBe(false);
  });

  it('devuelve false con null o undefined', () => {
    expect(isOnboardingDataComplete(null)).toBe(false);
    expect(isOnboardingDataComplete(undefined)).toBe(false);
  });

  it('devuelve false si falta el objetivo', () => {
    const { objetivo_principal, ...sinObjetivo } = perfilCompleto;
    expect(isOnboardingDataComplete(sinObjetivo)).toBe(false);
  });

  it('devuelve false si falta algún dato básico (altura)', () => {
    const { altura_cm, ...sinAltura } = perfilCompleto;
    expect(isOnboardingDataComplete(sinAltura)).toBe(false);
  });

  it('devuelve false si falta la disponibilidad', () => {
    const { dias_disponibles, ...sinDias } = perfilCompleto;
    expect(isOnboardingDataComplete(sinDias)).toBe(false);
  });

  it('devuelve false si equipamiento es un array vacío', () => {
    expect(isOnboardingDataComplete({ ...perfilCompleto, equipamiento: [] })).toBe(false);
  });

  it('distingue "no preguntado" de "sin lesiones": false si falta la key lesiones_activas', () => {
    const { lesiones_activas, ...sinLesiones } = perfilCompleto;
    expect(isOnboardingDataComplete(sinLesiones)).toBe(false);
  });

  it('devuelve false si un campo numérico llega como string', () => {
    expect(isOnboardingDataComplete({ ...perfilCompleto, edad: '36' })).toBe(false);
  });

  it('devuelve false si el objetivo es una cadena vacía', () => {
    expect(isOnboardingDataComplete({ ...perfilCompleto, objetivo_principal: '' })).toBe(false);
  });
});
