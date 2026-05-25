'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { acceptDisclaimer } from '@/app/actions/disclaimer';
import { AlertTriangle } from 'lucide-react';

export default function DisclaimerPage() {
  const t = useTranslations('disclaimer');
  const locale = useLocale();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleAccept() {
    if (!accepted) return;

    startTransition(async () => {
      await acceptDisclaimer();
      router.push(`/${locale}/coach?onboarding=true`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-base">
      {/* Header */}
      <div className="flex items-center justify-center border-b border-border-subtle px-4 py-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-status-warning" />
          <h1 className="text-lg font-semibold text-text-primary">
            {t('title')}
          </h1>
        </div>
      </div>

      {/* Scrollable text */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-md space-y-6">
          {/* Spanish */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Español
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
              <p className="font-semibold text-text-primary">
                Aviso importante
              </p>
              <p>
                Kinética es una herramienta de entrenamiento y seguimiento personal. No
                sustituye el consejo, diagnóstico o tratamiento de un profesional de la
                salud cualificado.
              </p>
              <p>
                Kai, el coach virtual, ofrece sugerencias basadas en principios generales
                de entrenamiento y en los datos que tú compartes. Sus recomendaciones no
                son consejo médico.
              </p>
              <p>
                Antes de empezar cualquier programa de entrenamiento, especialmente si
                tienes condiciones médicas preexistentes, lesiones o llevas tiempo sin
                actividad física regular, consulta con tu médico.
              </p>
              <p>
                Si experimentas dolor agudo, mareos, dificultad para respirar o cualquier
                síntoma preocupante durante el ejercicio, detente y busca atención médica.
              </p>
              <p>
                Al usar Kinética aceptas que la información que recibes es de carácter
                educativo y motivacional, y que la responsabilidad final sobre tu salud y
                entrenamiento es tuya.
              </p>
            </div>
          </section>

          <div className="border-t border-border-subtle" />

          {/* English */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              English
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
              <p className="font-semibold text-text-primary">
                Important notice
              </p>
              <p>
                Kinética is a personal training and tracking tool. It does not replace
                qualified medical advice, diagnosis, or treatment.
              </p>
              <p>
                Kai, the virtual coach, offers suggestions based on general training
                principles and the data you share. Its recommendations are not medical
                advice.
              </p>
              <p>
                Before starting any training program, especially if you have pre-existing
                medical conditions, injuries, or have been inactive for some time, consult
                your doctor.
              </p>
              <p>
                If you experience sharp pain, dizziness, breathing difficulty, or any
                concerning symptoms during exercise, stop and seek medical attention.
              </p>
              <p>
                By using Kinética you accept that the information you receive is educational
                and motivational in nature, and that the ultimate responsibility for your
                health and training is yours.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-border-subtle bg-bg-elevated px-4 py-5">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              id="accept-disclaimer"
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-default bg-bg-overlay accent-accent"
            />
            <span className="text-sm text-text-secondary">
              {t('acceptCheckbox')}
            </span>
          </label>

          <button
            type="button"
            onClick={handleAccept}
            disabled={!accepted || isPending}
            className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-[#0A0E14] transition-colors hover:bg-accent-hover disabled:bg-border-default disabled:text-text-muted"
          >
            {isPending ? '...' : t('acceptButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
