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
    },
  },
  plugins: [],
};

