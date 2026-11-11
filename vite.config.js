import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { previewMediaPlugin } from './tools/preview-media.mjs'
import { tvboxDevPlugin } from './tools/tvbox-dev.mjs'

export default defineConfig({
	plugins: [uni(), previewMediaPlugin(), tvboxDevPlugin(), ...(process.env.LOCAL_VIDEO_NETLIFY === '1' ? [{
		name: 'localvideo-public-preview',
		enforce: 'pre',
		transform(code, id) {
			if (id.replace(/\\/g, '/').split('?')[0].endsWith('/core/preview-library.js')) return { code: 'export const PREVIEW_LIBRARY = []; export const PREVIEW_LIBRARY_META = {}', map: null }
		}
	}] : [])]
})
