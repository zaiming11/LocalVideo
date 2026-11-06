import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('../../', import.meta.url))
const defaultRoot = 'G:/下载/1 汪汪队立大功国语视频1-10季/汪汪队立大功.第1季.4K.国语'

// Serve only the preview video and thumbnail folders, on the H5 server itself.
// There is no second service to start and no browser-side loopback address.
export function createPreviewMediaMiddleware({
	videoRoot = process.env.LOCAL_VIDEO_PREVIEW_ROOT || defaultRoot,
	thumbRoot = path.join(workspace, 'preview-media/thumbs')
} = {}) {
	return (req, res, next) => {
		const pathname = (req.url || '').split('?')[0]
		const match = /^\/__preview_media\/(video|thumbs)\/(.+)$/.exec(pathname)
		if (!match) return next()
		let name
		try { name = decodeURIComponent(match[2]) } catch { res.writeHead(400).end(); return }
		// Preview files are flat; never allow traversal, drive paths or subfolders.
		if (/[\\/:\x00]/.test(name) || name === '.' || name === '..') {
			res.writeHead(403).end(); return
		}
		if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return }
		const file = path.join(match[1] === 'video' ? videoRoot : thumbRoot, name)
		let stat
		try { stat = fs.statSync(file) } catch { res.writeHead(404).end('Preview file not found'); return }
		if (!stat.isFile()) { res.writeHead(404).end(); return }
		const headers = {
			'Content-Type': match[1] === 'video' ? 'video/mp4' : 'image/jpeg',
			'Accept-Ranges': 'bytes',
			'Cache-Control': 'no-cache'
		}
		let start = 0
		let end = stat.size - 1
		const range = req.headers.range
		if (range) {
			const parts = /^bytes=(\d*)-(\d*)$/.exec(range)
			if (!parts || (!parts[1] && !parts[2])) {
				res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return
			}
			if (!parts[1]) start = Math.max(0, stat.size - Number(parts[2]))
			else {
				start = Number(parts[1])
				if (parts[2]) end = Math.min(end, Number(parts[2]))
			}
			if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
				res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return
			}
			headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
		}
		headers['Content-Length'] = Math.max(0, end - start + 1)
		res.writeHead(range ? 206 : 200, headers)
		if (req.method === 'HEAD' || !stat.size) { res.end(); return }
		const stream = fs.createReadStream(file, { start, end })
		stream.on('error', () => res.destroy())
		res.on('close', () => stream.destroy())
		stream.pipe(res)
	}
}

export function previewMediaPlugin() {
	return {
		name: 'local-video-preview-media',
		apply: 'serve',
		configureServer(server) {
			if (process.env.UNI_PLATFORM === 'h5') server.middlewares.use(createPreviewMediaMiddleware())
		}
	}
}
