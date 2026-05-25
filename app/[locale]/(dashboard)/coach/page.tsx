import { Suspense } from 'react';
import { CoachChat } from '@/components/chat/coach-chat';

export default function CoachPage() {
  return (
    <Suspense fallback={<CoachLoading />}>
      <CoachChat />
    </Suspense>
  );
}

function CoachLoading() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] items-center justify-center">
      <div className="animate-pulse text-text-secondary">Cargando Coach Kai...</div>
    </div>
  );
}
