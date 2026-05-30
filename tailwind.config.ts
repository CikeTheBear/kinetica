import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Tokens semánticos → CSS variables. El valor real lo define cada tema
        // (`[data-theme="redline"]` / `[data-theme="kinetic"]`) en globals.css.
        // Cambiar de tema = cambiar el atributo data-theme en <html>.
        'bg-base': 'var(--bg-base)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-overlay': 'var(--bg-overlay)',
        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        // Accent — amarillo nitro (constante en ambos temas, pero vía var por consistencia)
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-pressed': 'var(--accent-pressed)',
        'accent-muted': 'var(--accent-muted)',
        'accent-glow': 'var(--accent-glow)',
        // Acento secundario: redline → rojo redline · kinetic → magenta eléctrico
        'accent-2': 'var(--accent-2)',
        // Texto sobre accent — SIEMPRE oscuro (ambos temas son dark)
        'on-accent': 'var(--on-accent)',
        // Status
        'status-success': '#4ADE80',
        'status-warning': '#FFB547',
        'status-danger': '#FF5757',
        'status-info': '#5AB8FF',
        // Metrics (independientes del tema; usadas en gráficas)
        'metric-weight': '#5AB8FF',
        'metric-muscle': '#E5FF00',
        'metric-fat': '#FFB547',
        'metric-hrv': '#C77DFF',
        'metric-sleep': '#7AA8FF',
        'metric-cardio': '#FF7AB6',
      },
      fontFamily: {
        // Roles tipográficos → variables que cada tema mapea a su fuente.
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
