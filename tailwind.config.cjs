module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['var(--atlas-pixel-font-family)'],
        sans: ['var(--atlas-ui-font-family)'],
        mono: ['var(--atlas-mono-font-family)'],
      },
    },
  },
  plugins: [],
};
