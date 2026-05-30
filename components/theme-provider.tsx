'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * Wrapper de next-themes para el sistema de temas de Kinética.
 *
 * - `attribute="data-theme"`: pone data-theme="redline|kinetic" en <html>.
 * - `themes`: los temas disponibles (sin tema de sistema; ambos son dark).
 * - `defaultTheme="redline"`: lo que ve un usuario nuevo.
 * - next-themes inyecta un script inline que fija el tema ANTES de pintar,
 *   evitando el parpadeo (FOUC) en la carga.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      themes={['redline', 'kinetic']}
      defaultTheme="redline"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
