import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { PageContainer } from '@/components/page-container';
import { ThemePicker } from '@/components/settings/theme-picker';

/**
 * Pantalla de Ajustes. De momento solo el selector de tema; pensada para crecer
 * (idioma, notificaciones, cuenta...).
 */
export default async function SettingsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  await requireUser(locale);
  return <SettingsContent />;
}

function SettingsContent() {
  const t = useTranslations('settings');

  return (
    <PageContainer>
      <h1 className="t-display text-2xl text-text-primary">{t('title')}</h1>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <Palette size={16} strokeWidth={1.5} className="text-accent" />
          <h2 className="font-mono-metrics text-xs uppercase tracking-[0.2em] text-text-secondary">
            {t('appearance')}
          </h2>
        </div>
        <ThemePicker />
      </section>
    </PageContainer>
  );
}
