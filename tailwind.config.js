/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        nv: {
          bg: '#000000',
          sidebar: '#161618',
          'sidebar-hover': '#1c1c1e',
          channels: '#222224',
          content: '#2c2c2e',
          surface: '#3a3a3c',
          border: '#2c2c2e',
          'text-primary': '#f5f5f7',
          'text-secondary': '#86868b',
          'text-tertiary': '#515154',
          accent: '#34C759',
          'accent-hover': '#28a745',
          'accent-muted': 'rgba(52,199,89,0.12)',
          danger: '#FF3B30',
          'danger-muted': 'rgba(255,59,48,0.12)',
          warning: '#FF9F0A',
          blue: '#0A84FF',
          pink: '#FF375F',
          purple: '#BF5AF2',
          indigo: '#5E5CE6',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Inter',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      letterSpacing: {
        widest: '0.12em',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      boxShadow: {
        'glow-accent': '0 0 20px rgba(52, 199, 89, 0.3)',
        'glow-blue': '0 0 20px rgba(10, 132, 255, 0.3)',
        'glow-danger': '0 0 20px rgba(255, 59, 48, 0.3)',
        'elevation-1': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'elevation-2': '0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
        'elevation-3': '0 8px 32px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4)',
        'modal': '0 24px 80px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'fade-in-fast': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-up-soft': 'slideUp 0.25s ease-out',
        'slide-in-left': 'slideInLeft 0.25s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'scale-in-soft': 'scaleIn 0.18s ease-out',
        'pulse-soft': 'pulseSoft 2.5s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'bounce-subtle': 'bounceSubtle 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(52,199,89,0.4)' },
          '50%': { boxShadow: '0 0 14px rgba(52,199,89,0.85)' },
        },
        bounceSubtle: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(0.94)' },
          '70%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
