import type { Metadata, Viewport } from 'next';
import { Saira, Hanken_Grotesk, Martian_Mono, Anton } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { ThemeProvider } from '@/components/theme-provider';
import './../globals.css';

// Fuentes del sistema de temas. Cada tema (globals.css) mapea estos --font-*
// a sus roles (display / body / mono).
//  · Saira         → display de REDLINE (técnica, sporty)
//  · Anton         → display de KINETIC (poster condensado)
//  · Hanken Grotesk→ body en ambos
//  · Martian Mono  → métricas/datos en ambos
const saira = Saira({ subsets: ['latin'], variable: '--font-saira', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
const martian = Martian_Mono({ subsets: ['latin'], variable: '--font-martian', display: 'swap' });
const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton', display: 'swap' });

export const metadata: Metadata = {
  title: 'Kinética — Coach de entrenamiento con IA',
  description:
    'Tu entrenador personal inteligente. Planes, seguimiento y coach virtual Kai.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kinética',
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0E14',
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      // suppressHydrationWarning: next-themes ajusta data-theme en cliente antes
      // de pintar; sin esto React avisaría de mismatch en el atributo de <html>.
      suppressHydrationWarning
      className={`${saira.variable} ${hanken.variable} ${martian.variable} ${anton.variable}`}
    >
      <body className="grain-overlay bg-bg-base text-text-primary antialiased">
        <ThemeProvider>
          <NextIntlClientProvider messages={messages} locale={locale}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
