import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Сборка упаковывает всё приложение (JS + CSS) в один файл dist/index.html.
// Его можно открывать локально, класть на любой сервер или хостинг.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2020' },
})