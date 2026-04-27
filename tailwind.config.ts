import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.6s ease forwards',
      },
      colors: {
        navy: {
          DEFAULT: '#0B1F45',
          foreground: '#F4F6F9',
        },
        gold: {
          DEFAULT: '#C8973A',
          muted: '#A67C2E',
        },
        teal: {
          DEFAULT: '#0F8A6E',
          foreground: '#F0FDF9',
        },
        shell: {
          bg: '#F3F4F6',
          card: '#FFFFFF',
          border: '#E5E7EB',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        shell: 'none',
      },
    },
  },
  plugins: [],
};

export default config;
