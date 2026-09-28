// Atlas UI tokens. Ink navy panels, parchment text, brass frames and primary
// actions; star teal marks keyboard focus and nothing else. The pixel art is
// drawn at 2 screen pixels per art pixel, and the type sizes sit on the fonts'
// own pixel grids (Pixelify Sans: 11px per em-pixel step, Monocraft: 9px).
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['var(--atlas-pixel-font-family)'],
        sans: ['var(--atlas-ui-font-family)'],
        mono: ['var(--atlas-mono-font-family)'],
        tool: ['var(--atlas-tool-font-family)'],
      },
      fontSize: {
        // Pixelify Sans, crisp: 1x for badges, 2x for the interface, 3x and 4x for titles.
        'px-1': ['11px', { lineHeight: '14px' }],
        'px-2': ['22px', { lineHeight: '26px' }],
        'px-3': ['33px', { lineHeight: '40px' }],
        'px-4': ['44px', { lineHeight: '52px' }],
        // Long reading (release notes, the tutorial): comfortable over crisp.
        read: ['16px', { lineHeight: '24px' }],
        // Monocraft at 2x: chat, commands, the debug screen.
        'mono-2': ['18px', { lineHeight: '22px' }],
      },
      colors: {
        ink: {
          950: '#070917',
          900: '#0b0e1a',
          850: '#0f1328',
          800: '#141a36',
          750: '#18203f',
          700: '#1d2649',
          600: '#26315a',
          500: '#2f3c66',
          400: '#46578a',
          300: '#6d7db0',
        },
        parchment: {
          50: '#fffaf0',
          100: '#fbf3dc',
          200: '#efe2bf',
          300: '#d8c79d',
          400: '#b3a47c',
          500: '#877c60',
        },
        brass: {
          100: '#fff1c4',
          200: '#f3d488',
          300: '#e2b866',
          400: '#c99a4a',
          500: '#a47a36',
          600: '#7a5424',
          700: '#5a3c19',
          800: '#3e2c12',
        },
        ember: {
          300: '#d8644c',
          400: '#b23b2e',
          500: '#8c2b24',
          600: '#5e1a15',
        },
        star: '#8fe3d6',
      },
    },
  },
  plugins: [],
};
