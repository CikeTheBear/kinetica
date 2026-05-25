import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renderizador de markdown para las respuestas de Kai.
 * Usa react-markdown + remark-gfm para soportar:
 * - Negritas, cursivas, tachado
 * - Listas ordenadas y desordenadas
 * - Links
 * - Código inline y bloques
 * - Tablas (GFM)
 * - Citas en bloque
 * - Separadores
 *
 * Todo estilizado con Tailwind para que se vea bien en dark mode.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings: Kai no debería usar h1/h2 en chat, pero por si acaso
        h1: ({ children }) => (
          <h1 className="mb-2 text-lg font-bold text-text-primary">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1.5 text-base font-semibold text-text-primary">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 text-sm font-semibold text-text-secondary">{children}</h3>
        ),

        // Párrafos — heredan color del contenedor padre
        p: ({ children }) => (
          <p className="mb-2 text-sm leading-relaxed">{children}</p>
        ),

        // Negritas — heredan color del contenedor padre
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),

        // Cursivas
        em: ({ children }) => (
          <em className="italic text-text-secondary">{children}</em>
        ),

        // Tachado (~~texto~~)
        del: ({ children }) => (
          <del className="text-text-muted line-through">{children}</del>
        ),

        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover"
          >
            {children}
          </a>
        ),

        // Listas desordenadas
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc text-sm">{children}</ul>
        ),

        // Listas ordenadas
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal text-sm">{children}</ol>
        ),

        // Items de lista
        li: ({ children }) => (
          <li className="mb-1">{children}</li>
        ),

        // Código inline
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-bg-overlay px-1.5 py-0.5 font-mono-metrics text-xs text-accent">
                {children}
              </code>
            );
          }
          // Bloque de código
          return (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-bg-base p-3">
              <code className="font-mono-metrics text-xs text-text-secondary">
                {children}
              </code>
            </pre>
          );
        },

        // Tablas (GFM)
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-border-default bg-bg-overlay">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border-subtle px-3 py-2">
            {children}
          </td>
        ),

        // Citas en bloque
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-accent bg-accent-muted pl-3 text-sm text-text-secondary">
            {children}
          </blockquote>
        ),

        // Separadores (---)
        hr: () => (
          <hr className="my-3 border-border-subtle" />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
