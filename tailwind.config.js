/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        cream: { 50: '#FFFBF5', 100: '#FDF5E9', 200: '#F8E9D2', 300: '#F0D9B5' },
        spice: { 100: '#FDE6D4', 200: '#F9CBA7', 300: '#F3AC7A', 400: '#EC9058', 500: '#E07A3F', 600: '#C9622A', 700: '#A14C20' },
        sage: { 50: '#F3F7F1', 100: '#E5EEE2', 200: '#CADDC4', 300: '#A9C5A2', 500: '#7A9E7E', 600: '#5F8463', 700: '#4A6A4E' },
        cocoa: { 300: '#B9A391', 500: '#8A6E58', 700: '#5B4636', 900: '#3B2A1E' },
        berry: { 100: '#F8DEE0', 500: '#C4626B', 600: '#A84C55' },
        honey: { 100: '#FFF1CC', 300: '#F7D27A', 500: '#D4A24C' },
      },
      fontFamily: {
        sans: ['Rubik', 'system-ui', 'sans-serif'],
        display: ['"Secular One"', 'Rubik', 'sans-serif'],
        hand: ['"Amatic SC"', 'Rubik', 'cursive'],
      },
      boxShadow: {
        soft: '0 2px 0 rgba(91,70,54,.06), 0 8px 24px -8px rgba(91,70,54,.18)',
        lift: '0 4px 0 rgba(91,70,54,.07), 0 16px 32px -10px rgba(91,70,54,.28)',
      },
      keyframes: {
        wiggle: { '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
        pop: { '0%': { transform: 'scale(.9)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
        rise: { '0%': { transform: 'translateY(12px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
      },
      animation: {
        wiggle: 'wiggle .5s ease-in-out',
        pop: 'pop .18s ease-out',
        rise: 'rise .3s ease-out both',
      },
    },
  },
  plugins: [],
};
