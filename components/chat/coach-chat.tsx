'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useChatStream } from './use-chat-stream';
import { ChatMessageBubble } from './chat-message';
import { Send, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function CoachChat() {
  const t = useTranslations('coach');
  const td = useTranslations('disclaimer');
  const { messages, isLoading, sendMessage } = useChatStream();
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get('onboarding') === 'true';
  const hasStartedOnboarding = useRef(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Iniciar onboarding automáticamente
  useEffect(() => {
    if (isOnboarding && !hasStartedOnboarding.current) {
      hasStartedOnboarding.current = true;
      // Enviamos un mensaje invisible al sistema para que Kai inicie
      // En la API route, el param `isProactive` hará que Kai inicie con propósito
      sendMessage(
        'Soy un nuevo usuario. Necesito que me hagas el onboarding. Pregúntame sobre mis objetivos, datos básicos, disponibilidad, equipamiento y lesiones.'
      );
    }
  }, [isOnboarding, sendMessage]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage(message);
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* Área de mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-lg font-medium text-text-primary">{t('title')}</p>
            <p className="mt-2 max-w-xs text-sm text-text-secondary">
              {t('emptyState')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                content={msg.content}
                role={msg.role}
                isStreaming={msg.isStreaming}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border-subtle bg-bg-elevated/90 px-4 py-3 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-border-default bg-bg-overlay px-4 py-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={t('placeholder')}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[#0A0E14] transition-opacity disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>

        {/* Footer link: aviso médico */}
        <div className="mx-auto mt-2 flex max-w-md justify-center">
          <button
            type="button"
            onClick={() => setShowDisclaimerModal(true)}
            className="text-xs text-text-muted underline decoration-text-muted/50 underline-offset-2 transition-colors hover:text-text-secondary"
          >
            {td('footerLink')}
          </button>
        </div>
      </form>

      {/* Modal de aviso médico */}
      {showDisclaimerModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-bg-elevated sm:rounded-2xl">
            {/* Header del modal */}
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <h2 className="text-base font-semibold text-text-primary">
                {td('title')}
              </h2>
              <button
                type="button"
                onClick={() => setShowDisclaimerModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
                <p className="font-semibold text-text-primary">
                  Aviso importante / Important notice
                </p>
                <p>
                  Kinética es una herramienta de entrenamiento y seguimiento personal. No
                  sustituye el consejo, diagnóstico o tratamiento de un profesional de la
                  salud cualificado.
                </p>
                <p>
                  Kinética is a personal training and tracking tool. It does not replace
                  qualified medical advice, diagnosis, or treatment.
                </p>
                <p>
                  Kai, el coach virtual, ofrece sugerencias basadas en principios generales
                  de entrenamiento y en los datos que tú compartes. Sus recomendaciones no
                  son consejo médico.
                </p>
                <p>
                  Kai, the virtual coach, offers suggestions based on general training
                  principles and the data you share. Its recommendations are not medical
                  advice.
                </p>
                <p>
                  Antes de empezar cualquier programa de entrenamiento, especialmente si
                  tienes condiciones médicas preexistentes, lesiones o llevas tiempo sin
                  actividad física regular, consulta con tu médico.
                </p>
                <p>
                  Before starting any training program, especially if you have pre-existing
                  medical conditions, injuries, or have been inactive for some time, consult
                  your doctor.
                </p>
                <p>
                  Si experimentas dolor agudo, mareos, dificultad para respirar o cualquier
                  síntoma preocupante durante el ejercicio, detente y busca atención médica.
                </p>
                <p>
                  If you experience sharp pain, dizziness, breathing difficulty, or any
                  concerning symptoms during exercise, stop and seek medical attention.
                </p>
                <p>
                  Al usar Kinética aceptas que la información que recibes es de carácter
                  educativo y motivacional, y que la responsabilidad final sobre tu salud y
                  entrenamiento es tuya.
                </p>
                <p>
                  By using Kinética you accept that the information you receive is educational
                  and motivational in nature, and that the ultimate responsibility for your
                  health and training is yours.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
