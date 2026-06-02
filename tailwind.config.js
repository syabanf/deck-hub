/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: '#0b0b0f',
          surface: '#16161d',
          card: '#1c1c25',
          border: '#2a2a36',
          accent: '#e50914',
          accentDim: '#b00710',
          muted: '#8a8a99',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Helvetica Neue"', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 250ms ease-out',
        'slide-up': 'slideUp 300ms ease-out',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.2, 0.8, 0.2, 1.2)',
        'shimmer': 'shimmer 2s infinite linear',
        'check-pop': 'checkPop 500ms cubic-bezier(0.2, 0.8, 0.2, 1.4) forwards',
        'glow-pulse': 'glowPulse 1.6s ease-in-out infinite',
        'toast-in': 'toastIn 350ms cubic-bezier(0.2, 0.8, 0.2, 1.2)',
        'tab-slide': 'tabSlide 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'sparkle': 'sparkle 1.2s ease-out forwards',
        'wiggle': 'wiggle 400ms ease-in-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: 0, transform: 'scale(0.92)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        checkPop: {
          '0%': { transform: 'scale(0)', opacity: 0 },
          '70%': { transform: 'scale(1.15)', opacity: 1 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(229, 9, 20, 0.5)' },
          '50%': { boxShadow: '0 0 0 12px rgba(229, 9, 20, 0)' },
        },
        toastIn: {
          '0%': { opacity: 0, transform: 'translateY(-20px) scale(0.95)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        tabSlide: {
          '0%': { opacity: 0, transform: 'translateX(8px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
        sparkle: {
          '0%': { transform: 'scale(0) rotate(0deg)', opacity: 1 },
          '100%': { transform: 'scale(1.5) rotate(180deg)', opacity: 0 },
        },
        wiggle: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
      },
    },
  },
  plugins: [],
}
