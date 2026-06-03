export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        'om-accent-from': '#FF8918',
        'om-accent-to': '#A22904',
      },
      keyframes: {
        indeterminate: {
          '0%':   { transform: 'translateX(-100%) scaleX(0.3)' },
          '40%':  { transform: 'translateX(0%)    scaleX(0.6)' },
          '100%': { transform: 'translateX(200%)  scaleX(0.3)' },
        },
      },
      animation: {
        indeterminate: 'indeterminate 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

