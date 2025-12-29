/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./pxltool/**/*.{js,ts,jsx,tsx,html}", // <-- СМОТРИМ ТОЛЬКО ВНУТРЬ ПАПКИ ИНСТРУМЕНТА
    "./pxltool_color/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}