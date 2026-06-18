/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables (RGB channels) so the whole palette switches
        // with the light/dark theme class on <html>. See index.css.
        ghost: {
          bg: 'rgb(var(--ghost-bg) / <alpha-value>)',
          surface: 'rgb(var(--ghost-surface) / <alpha-value>)',
          card: 'rgb(var(--ghost-card) / <alpha-value>)',
          border: 'rgb(var(--ghost-border) / <alpha-value>)',
          accent: 'rgb(var(--ghost-accent) / <alpha-value>)',
          accentDim: 'rgb(var(--ghost-accentDim) / <alpha-value>)',
          cyan: 'rgb(var(--ghost-cyan) / <alpha-value>)',
          green: 'rgb(var(--ghost-green) / <alpha-value>)',
          orange: 'rgb(var(--ghost-orange) / <alpha-value>)',
          red: 'rgb(var(--ghost-red) / <alpha-value>)',
          yellow: 'rgb(var(--ghost-yellow) / <alpha-value>)',
          text: 'rgb(var(--ghost-text) / <alpha-value>)',
          muted: 'rgb(var(--ghost-muted) / <alpha-value>)',
          dim: 'rgb(var(--ghost-dim) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 4px rgba(108,99,255,0.3)' },
          '100%': { boxShadow: '0 0 16px rgba(108,99,255,0.8)' },
        },
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(rgba(108,99,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(108,99,255,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        'grid': '24px 24px',
      },
    },
  },
  plugins: [],
}

