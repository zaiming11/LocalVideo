import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { test } from 'node:test'
import { createPreviewMediaMiddleware } from './preview-media.mjs'
import { normalizePreviewUrls } from '../core/preview-url.js'

test('preview serves media, HEAD and seek ranges; rejects missing files and traversal', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-video-preview-'))
	fs.writeFileSync(path.join(root, '第001集.mp4'), '0123456789')
	const middleware = createPreviewMediaMiddleware({ videoRoot: root, thumbRoot: root })
	const server = http.createServer((req, res) => middleware(req, res, () => res.writeHead(404).end()))
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	t.after(async () => {
		server.closeAllConnections()
		await new Promise((resolve) => server.close(resolve))
		fs.rmSync(root, { recursive: true, force: true })
	})
	const base = `http://127.0.0.1:${server.address().port}/__preview_media/video/`
	const url = base + encodeURIComponent('第001集.mp4')
	const full = await fetch(url)
	assert.equal(full.headers.get('content-type'), 'video/mp4')
	assert.equal(await full.text(), '0123456789')
	const head = await fetch(url, { method: 'HEAD' })
	assert.equal(head.headers.get('content-length'), '10')
	assert.equal(await head.text(), '')
	for (const [range, body, contentRange] of [['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10']]) {
		const response = await fetch(url, { headers: { Range: range } })
		assert.equal(response.status, 206)
		assert.equal(response.headers.get('content-range'), contentRange)
		assert.equal(await response.text(), body)
	}
	assert.equal((await fetch(url, { headers: { Range: 'bytes=10-' } })).status, 416)
	assert.equal((await fetch(base + 'missing.mp4')).status, 404)
	assert.equal((await fetch(base + '..%5Cprivate.mp4')).status, 403)
	assert.equal((await fetch(base + '%ZZ')).status, 400)
})

test('saved preview URLs migrate without changing imported files or playback metadata', () => {
	const old = { preview: true, id: 'episode1', duration: 100, url: 'http://127.0.0.1:8098/video/001.mp4', thumb: 'http://127.0.0.1:8098/thumbs/001.jpg' }
	assert.deepEqual(normalizePreviewUrls(old), { ...old, url: '/__preview_media/video/001.mp4', thumb: '/__preview_media/thumbs/001.jpg', poster: undefined })
	const personal = { url: 'blob:personal-file' }
	assert.equal(normalizePreviewUrls(personal), personal)
})
