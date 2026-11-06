import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { previewMediaPlugin } from './tools/preview-media.mjs'

export default defineConfig({
	plugins: [uni(), previewMediaPlugin()]
})
