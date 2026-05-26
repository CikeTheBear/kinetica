'use client';

import { useState, useCallback, useRef } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

/**
 * Hook para manejar el streaming de chat con la API de Kai.
 * Implementa SSE parsing con acumulación de tokens y bloques especiales.
 */
export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim()) return;

    // Abortar cualquier stream anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Agregar mensaje del usuario
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: userMessage },
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ]);

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = ''; // Buffer para manejar chunks fragmentados
      let streamEnded = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Procesar solo líneas completas (que terminan en \n)
          const lines = buffer.split('\n');
          // La última línea puede estar incompleta, la guardamos para el próximo chunk
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            
            const data = line.slice(6);

            if (data === '[DONE]') {
              streamEnded = true;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, isStreaming: false }
                    : msg
                )
              );
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulatedContent += parsed.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
              }
            } catch {
              // Ignorar JSON inválido (puede ser un chunk incompleto)
            }
          }
        }
        
        // Procesar cualquier dato restante en el buffer
        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6);
          if (data === '[DONE]') {
            streamEnded = true;
          } else {
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulatedContent += parsed.content;
              }
            } catch {
              // Ignorar
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Asegurar que el mensaje se marca como completado
      if (!streamEnded) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: accumulatedContent || msg.content, isStreaming: false }
              : msg
          )
        );
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // El usuario canceló, no es un error real
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, isStreaming: false }
              : msg
          )
        );
        return;
      }

      console.error('Error en streaming:', error);
      setError((error as Error).message || 'Error de conexión con Kai');
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: 'No puedo responder en este momento. Por favor, inténtalo de nuevo.',
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    cancelStream,
  };
}
