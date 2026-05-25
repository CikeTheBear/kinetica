'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useChatStream } from './use-chat-stream';
import { ChatMessageBubble } from './chat-message';
import { Send, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';

export function CoachChat() {
  const t = useTranslations('coach');
  const { messages, isLoading, sendMessage } = useChatStream();
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get('onboarding') === 'true';
  const hasStartedOnboarding = useRef(false);

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
      </form>
    </div>
  );
}
