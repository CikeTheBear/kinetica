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
        // Base backgrounds
        'bg-base': '#0A0E14',
        'bg-elevated': '#141A22',
        'bg-overlay': '#1E2733',
        // Borders
        'border-subtle': '#1E2733',
        'border-default': '#2A3441',
        // Text
        'text-primary': '#E8EEF2',
        'text-secondary': '#8B98A8',
        'text-muted': '#5A6573',
        // Accent — amarillo nitro
        accent: '#E5FF00',
        'accent-hover': '#C8E000',
        'accent-pressed': '#A8BF00',
        'accent-muted': 'rgba(229, 255, 0, 0.08)',
        'accent-glow': 'rgba(229, 255, 0, 0.25)',
        // Text over accent — CRITICAL: always dark
        'on-accent': '#0A0E14',
        // Status
        'status-success': '#4ADE80',
        'status-warning': '#FFB547',
        'status-danger': '#FF5757',
        'status-info': '#5AB8FF',
        // Metrics
        'metric-weight': '#5AB8FF',
        'metric-muscle': '#E5FF00',
        'metric-fat': '#FFB547',
        'metric-hrv': '#C77DFF',
        'metric-sleep': '#7AA8FF',
        'metric-cardio': '#FF7AB6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
