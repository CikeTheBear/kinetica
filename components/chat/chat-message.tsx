'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MarkdownRenderer } from './markdown-renderer';

interface ChatMessageProps {
  content: string;
  role: 'user' | 'assistant';
  isStreaming?: boolean;
}

/**
 * Parsea el contenido de Kai y renderiza:
 * - Texto normal como markdown básico
 * - Bloques especiales ```kinetica:plan-card, chart, alert como componentes inline
 */
export function ChatMessageBubble({ content, role, isStreaming }: ChatMessageProps) {
  const parsedBlocks = useMemo(() => parseContent(content), [content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full ${role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          role === 'user'
            ? 'bg-accent text-[#0A0E14]'
            : 'bg-bg-elevated text-text-primary'
        }`}
      >
        {parsedBlocks.map((block, index) => (
          <BlockRenderer key={index} block={block} />
        ))}
        {isStreaming && (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        )}
      </div>
    </motion.div>
  );
}

/**
 * Divide el contenido en bloques: texto normal y bloques especiales de Kai.
 */
function parseContent(content: string): Array<{ type: 'text'; content: string } | { type: 'special'; kind: string; json: any }> {
  const blocks: ReturnType<typeof parseContent> = [];
  const regex = /```kinetica:(\w+)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Texto antes del bloque especial
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }

    // Bloque especial
    const kind = match[1];
    const jsonStr = match[2].trim();
    try {
      const json = JSON.parse(jsonStr);
      blocks.push({ type: 'special', kind, json });
    } catch {
      // Si el JSON no es válido, mostrar como texto
      blocks.push({ type: 'text', content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Texto restante después del último bloque
  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return blocks;
}

/**
 * Renderiza un bloque parseado según su tipo.
 */
function BlockRenderer({
  block,
}: {
  block: { type: 'text'; content: string } | { type: 'special'; kind: string; json: any };
}) {
  if (block.type === 'text') {
    return <MarkdownRenderer content={block.content} />;
  }

  // Bloque especial
  const { kind, json } = block;

  switch (kind) {
    case 'plan-card':
      return <PlanCard data={json} />;
    case 'chart':
      return <ChartBlock data={json} />;
    case 'alert':
      return <AlertBlock data={json} />;
    default:
      // Degradación segura: mostrar como código
      return (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-bg-base p-3 text-xs text-text-secondary">
          <code>{JSON.stringify(json, null, 2)}</code>
        </pre>
      );
  }
}

/**
 * Tarjeta de plan del día.
 */
function PlanCard({ data }: { data: any }) {
  const ejercicios = data.ejercicios || [];

  return (
    <div className="mt-2 rounded-xl border border-border-default bg-bg-base p-4">
      <h3 className="font-semibold text-accent">{data.titulo}</h3>
      <p className="mt-1 text-xs text-text-muted">
        Duración estimada: {data.duracion_min} min
      </p>
      <div className="mt-3 space-y-2">
        {ejercicios.map((ej: any, i: number) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-bg-overlay px-3 py-2 text-sm"
          >
            <span className="text-text-primary">{ej.nombre}</span>
            <span className="font-mono-metrics text-xs text-text-secondary">
              {ej.sets}x{ej.reps} {ej.peso}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bloque de gráfico (placeholder — se implementa con una librería de charts en v2).
 */
function ChartBlock({ data }: { data: any }) {
  return (
    <div className="mt-2 rounded-xl border border-border-default bg-bg-base p-4">
      <h3 className="text-sm font-medium text-text-primary">{data.titulo}</h3>
      <p className="text-xs text-text-muted">
        Tipo: {data.tipo} | Unidad: {data.unidad}
      </p>
      <div className="mt-2 rounded-lg bg-bg-overlay p-3">
        <p className="text-xs text-text-muted">
          {data.datos?.length || 0} puntos de datos
        </p>
      </div>
    </div>
  );
}

/**
 * Bloque de alerta destacada.
 */
function AlertBlock({ data }: { data: any }) {
  const colorMap: Record<string, string> = {
    info: 'border-status-info bg-status-info/10 text-status-info',
    success: 'border-status-success bg-status-success/10 text-status-success',
    warning: 'border-status-warning bg-status-warning/10 text-status-warning',
    danger: 'border-status-danger bg-status-danger/10 text-status-danger',
  };

  const colorClass = colorMap[data.nivel] || colorMap.info;

  return (
    <div className={`mt-2 rounded-xl border p-4 ${colorClass}`}>
      <h3 className="font-semibold">{data.titulo}</h3>
      <p className="mt-1 text-sm opacity-90">{data.mensaje}</p>
    </div>
  );
}
