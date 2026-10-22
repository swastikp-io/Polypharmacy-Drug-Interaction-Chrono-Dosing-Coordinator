/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Swiss-inspired editorial palette
        cobalt: {
          DEFAULT: '#1747E8',
          hover: '#1238C7',
          active: '#0F2FA8',
          50: '#F0F3FF',
          100: '#D7DEFF',
          200: '#B8C7FF',
          500: '#1747E8',
          600: '#1238C7',
          700: '#0F2FA8',
        },
        periwinkle: {
          DEFAULT: '#D7DEFF',
          light: '#EDF1FF',
          subtle: '#F4F6FF',
          border: '#C0CEFF',
        },
        warm: {
          bg: '#F4F2F0',
          surface: '#FAF9F8',
          card: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#171717',
          muted: '#777777',
          light: '#9E9E9E',
          divider: '#E6E3E1',
          border: '#D8D4D0',
        },
        review: {
          amber: '#B45309',
          bg: '#FEF3C7',
          border: '#FDE68A',
          subtle: '#FFFDF5',
        },
        alert: {
          red: '#DC2626',
          darkRed: '#991B1B',
          bg: '#FEE2E2',
          border: '#FECACA',
        },
        clinical: {
          50: '#F0F3FF',
          100: '#D7DEFF',
          200: '#B8C7FF',
          300: '#8AA5FF',
          400: '#4D75FF',
          500: '#1747E8',
          600: '#1238C7',
          700: '#0F2FA8',
          800: '#0B227B',
          900: '#081754',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        editorial: ['Newsreader', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        mono: ['SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', "'Liberation Mono'", "'Courier New'", 'monospace'],
      },
      boxShadow: {
        'editorial': '0 1px 3px 0 rgba(23, 23, 23, 0.04), 0 1px 2px -1px rgba(23, 23, 23, 0.04)',
        'editorial-md': '0 4px 6px -1px rgba(23, 23, 23, 0.05), 0 2px 4px -2px rgba(23, 23, 23, 0.05)',
      },
      fontSize: {
        '2xs': '0.6875rem',
        '3xs': '0.625rem',
      }
    },
  },
  plugins: [],
}
