import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Locales soportados — debe coincidir con middleware.ts
const locales = ['es', 'en'];

export default getRequestConfig(async ({ locale }) => {
  // Valida que el locale sea uno de los soportados
  if (!locales.includes(locale)) notFound();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
