/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'soft-pink': '#ffeef8',
        'soft-blue': '#e3f2fd',
        'soft-purple': '#f3e5f5',
      },
    },
  },
  plugins: [],
}
