import {
	VIDEO_EXTENSIONS,
	extLabel,
	getExtension,
	isVideoFile,
	makeVideoId,
	paletteFor,
	titleFromFilename
} from './utils.js'

const H5_BATCH_SIZE = 3

/* ------------------------------------------------------------------ *
 * Browser (H5) import
 * ------------------------------------------------------------------ */

export function browserSupportsDirectoryPicker() {
	// #ifdef H5
	if (typeof window !== 'undefined' && window.localVideoDesktop) return true
	return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
	// #endif
	// #ifndef H5
	return false
	// #endif
}

export function pickBrowserFiles() {
	// #ifdef H5
	if (window.localVideoDesktop) return window.localVideoDesktop.pickFiles()
	return new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = true
		input.accept = `video/*,${VIDEO_EXTENSIONS.map((ext) => `.${ext}`).join(',')}`
		input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;'
		document.body.appendChild(input)
		let settled = false
		const finish = (files) => {
			if (settled) return
			settled = true
			input.remove()
			resolve(files)
		}
		input.addEventListener('change', () => finish(Array.from(input.files || [])))
		input.addEventListener('cancel', () => finish([]))
		input.click()
	})
	// #endif
	// #ifndef H5
	return Promise.resolve([])
	// #endif
}

export async function pickBrowserDirectory(options = {}) {
	// #ifdef H5
	if (window.localVideoDesktop) return window.localVideoDesktop.pickDirectory()
	if (!browserSupportsDirectoryPicker()) {
		const error = new Error('当前浏览器不支持选择文件夹')
		error.code = 'UNSUPPORTED'
		throw error
	}
	const handle = await window.showDirectoryPicker({ mode: 'read' })
	const entries = []
	await walkDirectory(handle, handle.name, entries, 0, options.maxFiles || 600)
	return entries
	// #endif
	// #ifndef H5
	return []
	// #endif
}

async function walkDirectory(handle, folder, out, depth, maxFiles) {
	if (depth > 4 || out.length >= maxFiles) return
	for await (const entry of handle.values()) {
		if (out.length >= maxFiles) return
		if (entry.kind === 'directory') {
			if (/^(\.|node_modules$|Android$|LOST\.DIR$)/i.test(entry.name)) continue
			await walkDirectory(entry, folder ? `${folder}/${entry.name}` : entry.name, out, depth + 1, maxFiles)
			continue
		}
		if (entry.kind !== 'file' || !isVideoFile(entry.name)) continue
		try {
			const file = await entry.getFile()
			out.push({ file, folder: folder || '本机文件夹' })
		} catch (e) { /* skip unreadable entry */ }
	}
}

export async function filesFromDropEvent(event) {
	// #ifdef H5
	if (typeof window !== 'undefined' && window.localVideoDesktop) {
		return window.localVideoDesktop.importDroppedFiles(Array.from(event?.dataTransfer?.files || []))
	}
	// #endif
	const files = Array.from(event?.dataTransfer?.files || []).filter((file) => isVideoFile(file.name, file.type))
	return files.map((file) => ({ file, folder: '拖拽导入' }))
}

export async function importBrowserVideos(input, options = {}) {
	const incoming = (Array.isArray(input) ? input : [])
		.map((entry) => (entry && entry.file ? entry : { file: entry, folder: options.folder || '本机导入' }))
		.filter((entry) => entry.file && isVideoFile(entry.file.name, entry.file.type))
	if (!incoming.length) return []
	const results = new Array(incoming.length)
	let nextIndex = 0
	let completed = 0
	const onProgress = options.onProgress
	const workers = Array.from({ length: Math.min(H5_BATCH_SIZE, incoming.length) }, () => (async () => {
		while (nextIndex < incoming.length) {
			const index = nextIndex++
			const entry = incoming[index]
			try {
				results[index] = await probeBrowserVideo(entry.file, entry.folder)
			} catch (e) {
				results[index] = null
			}
			completed++
			if (onProgress) {
				onProgress(Math.round((completed / incoming.length) * 100), completed, incoming.length)
			}
		}
	})())
	await Promise.all(workers)
	return results.filter(Boolean)
}

function probeBrowserVideo(file, folder) {
	// #ifndef H5
	return Promise.reject(new Error('浏览器导入仅可在 H5 使用'))
	// #endif
	// #ifdef H5
	return new Promise((resolve) => {
		const objectUrl = file.desktopUrl || URL.createObjectURL(file)
		const video = document.createElement('video')
		video.preload = 'auto'
		video.muted = true
		video.playsInline = true
		video.crossOrigin = 'anonymous'
		video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:320px;height:180px;opacity:0;pointer-events:none;'
		document.body.appendChild(video)
		let metadataDone = false
		let thumbDone = false
		let settled = false
		const finish = (data) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			video.removeAttribute('src')
			try { video.load() } catch (e) { /* noop */ }
			video.remove()
			const result = {
				id: file.desktopId || makeVideoId(file.name, file.size, file.lastModified, folder || ''),
				title: titleFromFilename(file.name),
				name: file.name,
				url: objectUrl,
				thumb: data?.thumb || '',
				poster: data?.thumb || '',
				duration: data?.duration || 0,
				size: file.size,
				modified: file.lastModified || Date.now(),
				addedAt: Date.now(),
				folder: folder || '本机导入',
				ext: getExtension(file.name) || 'mp4',
				mime: file.type || 'video/mp4',
				width: data?.width || 0,
				height: data?.height || 0,
				episode: 0,
				series: folder || '本机导入',
				description: '',
				accent: paletteFor(file.name).accent,
				from: paletteFor(file.name).from,
				to: paletteFor(file.name).to,
				demo: false,
				source: file.desktopUrl ? 'desktop' : 'browser'
			}
			resolve(result)
		}
		const timeout = setTimeout(() => {
			finish({ duration: safeDuration(video.duration), width: video.videoWidth, height: video.videoHeight })
		}, 12000)

		const capture = () => {
			if (thumbDone) return
			thumbDone = true
			try {
				const thumb = drawVideoPoster(video, titleFromFilename(file.name), getExtension(file.name))
				finish({
					thumb,
					duration: safeDuration(video.duration),
					width: video.videoWidth,
					height: video.videoHeight
				})
			} catch (e) {
				finish({ duration: safeDuration(video.duration), width: video.videoWidth, height: video.videoHeight })
			}
		}
		const captureSoon = () => {
			setTimeout(capture, 160)
		}

		video.addEventListener('loadedmetadata', () => {
			metadataDone = true
			const duration = safeDuration(video.duration)
			const target = duration > 3 ? Math.min(duration * 0.22, 2.5) : Math.min(duration * 0.5, 1)
			if (target > 0.05) {
				try { video.currentTime = target } catch (e) { capture() }
			} else {
				capture()
			}
		}, { once: true })

		video.addEventListener('seeked', captureSoon, { once: true })
		video.addEventListener('loadeddata', () => {
			if (video.currentTime > 0.05) captureSoon()
		}, { once: true })
		video.addEventListener('error', () => {
			finish({ duration: 0, width: 0, height: 0 })
		}, { once: true })
		video.src = objectUrl
	})
	// #endif
}

function safeDuration(value) {
	return Number.isFinite(value) && value > 0 ? value : 0
}

function drawVideoPoster(video, title, ext) {
	if (!video.videoWidth || !video.videoHeight) throw new Error('no frame')
	const canvas = document.createElement('canvas')
	const width = 640
	const height = 360
	canvas.width = width
	canvas.height = height
	const ctx = canvas.getContext('2d')
	const sourceRatio = video.videoWidth / video.videoHeight
	const targetRatio = width / height
	let sx = 0
	let sy = 0
	let sw = video.videoWidth
	let sh = video.videoHeight
	if (sourceRatio > targetRatio) {
		sw = video.videoHeight * targetRatio
		sx = (video.videoWidth - sw) / 2
	} else {
		sh = video.videoWidth / targetRatio
		sy = (video.videoHeight - sh) / 2
	}
	ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
	// HEVC hardware surfaces can occasionally hand back an all-black frame to a
	// 2D canvas. Detect that instead of saving a useless black poster.
	try {
		const pixels = ctx.getImageData(0, 0, width, height).data
		let luminance = 0
		let samples = 0
		for (let i = 0; i < pixels.length; i += 4 * 97) {
			luminance += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722
			samples++
		}
		if (samples && luminance / samples < 2.5) {
			throw new Error('blank video frame')
		}
	} catch (e) {
		if (e?.message === 'blank video frame') throw e
		// Cross-origin canvas sampling can throw; keep the visual poster.
	}
	const gradient = ctx.createLinearGradient(0, height * 0.38, 0, height)
	gradient.addColorStop(0, 'rgba(3,5,7,0)')
	gradient.addColorStop(1, 'rgba(3,5,7,0.88)')
	ctx.fillStyle = gradient
	ctx.fillRect(0, 0, width, height)
	ctx.fillStyle = 'rgba(255,255,255,0.92)'
	ctx.font = '700 28px "Microsoft YaHei", "PingFang SC", sans-serif'
	ctx.fillText(clipText(ctx, title, 420), 28, 320)
	ctx.fillStyle = 'rgba(232,255,99,0.95)'
	ctx.font = '700 13px "Microsoft YaHei", sans-serif'
	ctx.fillText(extLabel(ext), 28, 342)
	ctx.strokeStyle = 'rgba(255,255,255,.2)'
	ctx.lineWidth = 1
	ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
	return canvas.toDataURL('image/jpeg', 0.72)
}

function clipText(ctx, text, maxWidth) {
	if (ctx.measureText(text).width <= maxWidth) return text
	let output = text
	while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
		output = output.slice(0, -1)
	}
	return `${output}…`
}

export function releaseBrowserVideo(video) {
	// #ifdef H5
	if (video?.url?.startsWith('blob:')) {
		try { URL.revokeObjectURL(video.url) } catch (e) { /* noop */ }
	}
	// #endif
}

/* ------------------------------------------------------------------ *
 * Android native MediaStore import
 * ------------------------------------------------------------------ */

function nativeError(code, message) {
	const error = new Error(message)
	error.code = code
	return error
}

function getAndroidSdk() {
	try {
		const Version = plus.android.importClass('android.os.Build$VERSION')
		return Number(Version.SDK_INT) || 33
	} catch (e) {
		return 33
	}
}

function getAndroidMediaPermission() {
	const sdk = getAndroidSdk()
	let targetSdk = sdk
	try {
		const main = plus.android.runtimeMainActivity()
		const info = plus.android.invoke(main, 'getApplicationInfo')
		targetSdk = Number(plus.android.getAttribute(info, 'targetSdkVersion')) || sdk
	} catch (e) { /* use the device version when target SDK is unavailable */ }
	// HBuilder 标准基座可能仍以旧版 SDK 为目标，需要申请旧版存储权限。
	return sdk >= 33 && targetSdk >= 33
		? 'android.permission.READ_MEDIA_VIDEO'
		: 'android.permission.READ_EXTERNAL_STORAGE'
}

export function isAndroidPermissionGranted() {
	// #ifdef APP-PLUS
	try {
		const permission = getAndroidMediaPermission()
		const main = plus.android.runtimeMainActivity()
		return plus.android.invoke(main, 'checkSelfPermission', permission) === 0
	} catch (e) { /* fall through */ }
	// #endif
	return false
}

export function requestAndroidMediaPermission() {
	// #ifdef APP-PLUS
	const permissions = [getAndroidMediaPermission()]
	return new Promise((resolve, reject) => {
		try {
			if (isAndroidPermissionGranted()) {
				resolve({ granted: permissions, partial: false })
				return
			}
			plus.android.requestPermissions(
				permissions,
				(result) => {
					const granted = result?.granted || []
					const deniedAlways = result?.deniedAlways || []
					if (granted.length > 0) {
						resolve({ granted, partial: false })
					} else if (deniedAlways.length > 0) {
						reject(nativeError('PERMISSION_DENIED_ALWAYS', '请在系统设置中允许访问视频'))
					} else {
						reject(nativeError('PERMISSION_DENIED', '需要视频访问权限才能读取本地视频'))
					}
				},
				(error) => reject(nativeError('PERMISSION_ERROR', error?.message || '无法申请视频权限'))
			)
		} catch (e) {
			reject(nativeError('PERMISSION_ERROR', e?.message || '无法申请视频权限'))
		}
	})
	// #endif
	// #ifndef APP-PLUS
	return Promise.reject(nativeError('NOT_APP', '仅在 Android App 中可用'))
	// #endif
}

export async function scanAndroidVideos(onProgress) {
	// #ifdef APP-PLUS
	await requestAndroidMediaPermission()
	return new Promise((resolve, reject) => {
		let cursor = null
		try {
			const main = plus.android.runtimeMainActivity()
			// Native.js 返回的 Java 对象不一定带有可直接调用的方法。
			const resolver = plus.android.invoke(main, 'getContentResolver')
			const Uri = plus.android.importClass('android.net.Uri')
			const uri = Uri.parse('content://media/external/video/media')
			cursor = plus.android.invoke(resolver, 'query', uri, null, null, null, null)
			if (!cursor) {
				resolve([])
				return
			}
			const total = Number(plus.android.invoke(cursor, 'getCount')) || 0
			const items = []
			if (total > 0 && plus.android.invoke(cursor, 'moveToFirst')) {
				const indexCache = {}
				const indexOf = (name) => {
					if (indexCache[name] === undefined) indexCache[name] = plus.android.invoke(cursor, 'getColumnIndex', name)
					return indexCache[name]
				}
				const readString = (name, fallback = '') => {
					const index = indexOf(name)
					if (index < 0) return fallback
					try {
						const value = plus.android.invoke(cursor, 'getString', index)
						return value === null || value === undefined ? fallback : String(value)
					} catch (e) {
						return fallback
					}
				}
				const readLong = (name, fallback = 0) => {
					const index = indexOf(name)
					if (index < 0) return fallback
					try {
						return Number(plus.android.invoke(cursor, 'getLong', index)) || fallback
					} catch (e) {
						return fallback
					}
				}
				let row = 0
				do {
					row++
					if (onProgress && (row % 20 === 0 || row === total)) {
						onProgress(Math.round((row / total) * 100), row, total)
					}
					const id = readLong('_id')
					// 使用列的实际名称，而不是 MediaStore 常量的 Java 字段名。
					const name = readString('_display_name', `视频 ${id}`)
					const size = readLong('_size')
					if (!id || !size) continue
					const dataPath = readString('_data')
					const mime = readString('mime_type', 'video/mp4')
					const dateModified = readLong('date_modified') * 1000
					const dateAdded = readLong('date_added') * 1000
					const folder = readString('bucket_display_name') || readString('relative_path') || '本机视频'
					const contentUri = `content://media/external/video/media/${id}`
					const ext = getExtension(name) || (mime.includes('matroska') ? 'mkv' : 'mp4')
					const palette = paletteFor(name)
					items.push({
						id: `android_${id}`,
						title: titleFromFilename(name),
						name,
						url: contentUri,
						contentUri,
						filePath: dataPath,
						thumb: `content://media/external/video/thumbnails/${id}`,
						poster: '',
						duration: Math.round(readLong('duration') / 1000),
						size,
						modified: dateModified || dateAdded || Date.now(),
						addedAt: dateAdded || dateModified || Date.now(),
						folder,
						ext,
						mime,
						width: readLong('width'),
						height: readLong('height'),
						episode: 0,
						series: folder,
						description: '',
						accent: palette.accent,
						from: palette.from,
						to: palette.to,
						demo: false,
						source: 'android'
					})
				} while (plus.android.invoke(cursor, 'moveToNext'))
			}
			plus.android.invoke(cursor, 'close')
			cursor = null
			resolve(items)
		} catch (e) {
			if (cursor) {
				try { plus.android.invoke(cursor, 'close') } catch (err) { /* noop */ }
			}
			reject(nativeError('SCAN_FAILED', e?.message || '读取本地视频失败'))
		}
	})
	// #endif
	// #ifndef APP-PLUS
	return Promise.reject(nativeError('NOT_APP', '仅在 Android App 中可用'))
	// #endif
}

export function openWithSystemPlayer(video) {
	// #ifdef APP-PLUS
	try {
		const main = plus.android.runtimeMainActivity()
		const Intent = plus.android.importClass('android.content.Intent')
		const Uri = plus.android.importClass('android.net.Uri')
		const intent = new Intent(Intent.ACTION_VIEW)
		const uri = video?.contentUri || video?.filePath || video?.url
		intent.setDataAndType(Uri.parse(uri), video?.mime || 'video/*')
		intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
		main.startActivity(intent)
		return true
	} catch (e) {
		try {
			plus.runtime.openURL(video?.contentUri || video?.url)
			return true
		} catch (err) {
			return false
		}
	}
	// #endif
	// #ifndef APP-PLUS
	return false
	// #endif
}

export function openAndroidPermissionSettings() {
	// #ifdef APP-PLUS
	try {
		const main = plus.android.runtimeMainActivity()
		const Intent = plus.android.importClass('android.content.Intent')
		const Settings = plus.android.importClass('android.provider.Settings')
		const Uri = plus.android.importClass('android.net.Uri')
		const intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
		intent.setData(Uri.parse(`package:${main.getPackageName()}`))
		main.startActivity(intent)
		return true
	} catch (e) {
		return false
	}
	// #endif
	// #ifndef APP-PLUS
	return false
	// #endif
}
