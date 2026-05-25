import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  // Lista de locales soportados
  locales: ['es', 'en'],

  // Locale por defecto
  defaultLocale: 'es',

  // Estrategia de locale:
  // 1. Prefijo en la URL (/es/dashboard, /en/dashboard)
  // 2. Cookie si existe
  // 3. Accept-Language header
  localePrefix: 'always',
});

export const config = {
  // Match all pathnames except static files and API routes
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
