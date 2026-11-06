import { computed, reactive } from 'vue'
import { DEMO_IDS, DEMO_VIDEOS } from './demo.js'
import { paletteFor, clamp, formatDuration } from './utils.js'
import { compareFileNames } from './natural-sort.js'
// The browser preview can mount a local folder through a tiny localhost media
// server. This import is compiled out of the Android app bundle.
// #ifdef H5
import { PREVIEW_LIBRARY } from './preview-library.js'
import { normalizePreviewUrls } from './preview-url.js'
// #endif

const STORAGE_KEY = 'local_video_state_v1'
const PLAYBACK_CHECKPOINT_KEY = 'local_video_playback_checkpoint_v1'
const MAX_PROGRESS_ENTRIES = 400
const LIBRARY_VIEW_DEFAULTS_VERSION = 1

const defaultSettings = {
	autoNext: true,
	rememberProgress: true,
	fullscreenFill: false,
	defaultRate: 1,
	viewMode: 'list',
	sortKey: 'name',
	sortDir: 'asc',
	volume: 1,
	muted: false
}

export const state = reactive({
	ready: false,
	videos: [],
	progress: {},
	history: [],
	lastPlayedId: '',
	lastTab: 'library',
	demoSeeded: false,
	demoDismissed: false,
	previewSeeded: false,
	libraryUpdatedAt: 0,
	queue: [],
	queueIndex: 0,
	currentId: '',
	settings: { ...defaultSettings },
	toast: {
		visible: false,
		message: '',
		type: 'default'
	},
	scanning: false,
	scanLabel: '正在读取本地视频…',
	scanProgress: 0
})

const videosById = computed(() => new Map(state.videos.map((video) => [video.id, video])))

let initialized = false
let persistTimer = null
let checkpointTimer = null
let checkpointId = ''
let persistenceRevision = 0
let toastTimer = null

function safeGetStorage() {
	try {
		return uni.getStorageSync(STORAGE_KEY) || null
	} catch (e) {
		return null
	}
}

function safeSetStorage(data) {
	try {
		uni.setStorageSync(STORAGE_KEY, data)
		return true
	} catch (e) {
		// localStorage can be full when a preview imported a lot of thumbnails.
		// Retry with a compact payload, never let a failed write break playback.
		try {
			const compact = {
				...data,
				videos: (data.videos || []).map((v) => ({ ...v, thumb: v.thumb?.startsWith('data:') ? '' : v.thumb })),
				progress: Object.fromEntries(
					Object.entries(data.progress || {}).map(([key, value]) => [
						key,
						{ ...value, thumb: value.thumb?.startsWith('data:') ? '' : value.thumb }
					])
				)
			}
			uni.setStorageSync(STORAGE_KEY, compact)
			return true
		} catch (err) {
			return false
		}
	}
}

function normalizeVideo(video) {
	// #ifdef H5
	video = normalizePreviewUrls(video)
	// #endif
	const palette = paletteFor(video.id || video.name)
	return {
		id: video.id,
		title: video.title || video.name || '未命名视频',
		latin: video.latin || '',
		name: video.name || '',
		url: video.url || '',
		thumb: video.thumb || video.poster || '',
		poster: video.poster || video.thumb || '',
		duration: Number(video.duration) || 0,
		size: Number(video.size) || 0,
		modified: Number(video.modified) || 0,
		addedAt: Number(video.addedAt || video.modified) || Date.now(),
		folder: video.folder || '未分类',
		ext: String(video.ext || '').toLowerCase(),
		mime: video.mime || 'video/mp4',
		width: Number(video.width) || 0,
		height: Number(video.height) || 0,
		episode: Number(video.episode) || 0,
		series: video.series || '',
		description: video.description || '',
		accent: video.accent || palette.accent,
		from: video.from || palette.from,
		to: video.to || palette.to,
		demo: !!video.demo,
		preview: !!video.preview,
		source: video.source || '',
		contentUri: video.contentUri || '',
		filePath: video.filePath || ''
	}
}

function sanitizeProgressMap(map = {}) {
	const entries = Object.entries(map).filter(([, value]) => value && Number(value.duration) > 0)
	entries.sort((a, b) => (Number(b[1].updatedAt) || 0) - (Number(a[1].updatedAt) || 0))
	return Object.fromEntries(entries.slice(0, MAX_PROGRESS_ENTRIES))
}

export function initStore() {
	if (initialized) return state
	initialized = true
	const saved = safeGetStorage()
	if (saved && typeof saved === 'object') {
		persistenceRevision = Number(saved.persistenceRevision) || 0
		const videos = Array.isArray(saved.videos) ? saved.videos : []
		state.videos = videos
			.filter((video) => video && video.url)
			.map(normalizeVideo)
		state.progress = sanitizeProgressMap(saved.progress || {})
		state.history = Array.isArray(saved.history) ? saved.history.slice(0, MAX_PROGRESS_ENTRIES) : []
		state.lastPlayedId = saved.lastPlayedId || ''
		state.lastTab = saved.lastTab || 'library'
		state.demoSeeded = !!saved.demoSeeded
		state.demoDismissed = !!saved.demoDismissed
		state.previewSeeded = !!saved.previewSeeded
		state.libraryUpdatedAt = Number(saved.libraryUpdatedAt) || 0
		state.settings = { ...defaultSettings, ...(saved.settings || {}) }
		if (saved.libraryViewDefaultsVersion !== LIBRARY_VIEW_DEFAULTS_VERSION) {
			Object.assign(state.settings, {
				viewMode: defaultSettings.viewMode,
				sortKey: defaultSettings.sortKey,
				sortDir: defaultSettings.sortDir
			})
		}
		if (Array.isArray(saved.queue)) state.queue = saved.queue.filter(Boolean)
		state.queueIndex = Number(saved.queueIndex) || 0
		state.currentId = saved.currentId || ''
	}
	// 播放中的小记录独立保存；版本不匹配的旧记录不能恢复已清空的历史。
	try {
		const checkpoint = uni.getStorageSync(PLAYBACK_CHECKPOINT_KEY)
		const entry = checkpoint?.entry
		const video = entry && getVideoById(entry.id)
		if (video && checkpoint.baseRevision === persistenceRevision && Number(entry.duration) > 0 && Number(entry.position) >= 1) {
			const restored = { ...state.progress[video.id], ...entry, id: video.id, title: video.title, name: video.name, folder: video.folder, thumb: video.thumb, demo: video.demo }
			state.progress[video.id] = restored
			state.history = [restored, ...state.history.filter((item) => item.id !== video.id)].slice(0, MAX_PROGRESS_ENTRIES)
			state.lastPlayedId = video.id
		}
	} catch (error) { /* a missing or damaged checkpoint must not hide the library */ }
	state.ready = true
	return state
}

export function saveState(options = {}) {
	if (!state.ready) return
	const compactVideos = state.videos
		.filter((video) => video.url && !String(video.url).startsWith('blob:'))
		.map((video) => ({
			...video,
			thumb: String(video.thumb || '').startsWith('data:') ? '' : video.thumb,
			poster: String(video.poster || '').startsWith('data:') ? '' : video.poster
		}))
	const payload = {
		persistenceRevision: persistenceRevision + 1,
		libraryViewDefaultsVersion: LIBRARY_VIEW_DEFAULTS_VERSION,
		videos: compactVideos,
		progress: state.progress,
		history: state.history.slice(0, MAX_PROGRESS_ENTRIES),
		lastPlayedId: state.lastPlayedId,
		lastTab: state.lastTab,
		demoSeeded: state.demoSeeded,
		demoDismissed: state.demoDismissed,
		previewSeeded: state.previewSeeded,
		libraryUpdatedAt: state.libraryUpdatedAt,
		settings: state.settings,
		queue: state.queue,
		queueIndex: state.queueIndex,
		currentId: state.currentId
	}
	const ok = safeSetStorage(payload)
	if (ok) {
		persistenceRevision = payload.persistenceRevision
		clearTimeout(checkpointTimer)
		checkpointTimer = null
		checkpointId = ''
		try { uni.removeStorageSync(PLAYBACK_CHECKPOINT_KEY) } catch (error) { /* revision also invalidates an old checkpoint */ }
	}
	if (options.immediate && persistTimer) {
		clearTimeout(persistTimer)
		persistTimer = null
	}
	return ok
}

export function saveSoon() {
	if (persistTimer) clearTimeout(persistTimer)
	persistTimer = setTimeout(() => {
		persistTimer = null
		saveState()
	}, 350)
}

function saveProgressSoon(id) {
	checkpointId = id
	clearTimeout(checkpointTimer)
	checkpointTimer = setTimeout(() => {
		checkpointTimer = null
		const entry = state.progress[checkpointId]
		if (!entry || !state.ready) return
		try {
			uni.setStorageSync(PLAYBACK_CHECKPOINT_KEY, {
				baseRevision: persistenceRevision,
				entry: { id: entry.id, position: entry.position, duration: entry.duration, percent: entry.percent, completed: entry.completed, updatedAt: entry.updatedAt }
			})
		} catch (error) { /* the next checkpoint or lifecycle save can retry */ }
	}, 350)
}

export function seedDemoLibrary() {
	initStore()
	// #ifndef H5
	return false
	// #endif
	// #ifdef H5
	if (state.demoDismissed || state.demoSeeded) return false
	const hasRealVideo = state.videos.some((video) => !video.demo && video.url)
	if (hasRealVideo) {
		state.demoSeeded = true
		saveState({ immediate: true })
		return false
	}
	const existing = new Map(state.videos.map((video) => [video.id, video]))
	const merged = DEMO_VIDEOS.map((video) => {
		const current = existing.get(video.id)
		return current ? { ...video, ...current, demo: true } : normalizeVideo(video)
	})
	const nonDemo = state.videos.filter((video) => !video.demo && video.url)
	state.videos = [...merged, ...nonDemo]
	state.demoSeeded = true
	state.libraryUpdatedAt = Date.now()
	saveState({ immediate: true })
	return true
	// #endif
}

/**
 * Mount the browser-only preview library generated from the local folder the
 * reviewer supplied. This is only reachable in H5; the Android build scans
 * MediaStore instead.
 */
export function seedPreviewLibrary(force = false) {
	initStore()
	// #ifndef H5
	return false
	// #endif
	// #ifdef H5
	if (!PREVIEW_LIBRARY.length) return false
	if (state.previewSeeded && !force) return false
	const hasPersonalVideos = state.videos.some((video) => !video.demo && !video.preview && video.url)
	if (hasPersonalVideos && !force) {
		state.previewSeeded = true
		saveState({ immediate: true })
		return false
	}
	const personal = state.videos.filter((video) => !video.demo && !video.preview)
	state.videos = [...PREVIEW_LIBRARY.map(normalizeVideo), ...personal]
	state.previewSeeded = true
	state.demoSeeded = true
	state.libraryUpdatedAt = Date.now()
	saveState({ immediate: true })
	return true
	// #endif
}

export function dismissDemoLibrary() {
	state.videos = state.videos.filter((video) => !video.demo)
	for (const id of DEMO_IDS) {
		delete state.progress[id]
	}
	if (DEMO_IDS.includes(state.lastPlayedId)) state.lastPlayedId = ''
	state.demoDismissed = true
	state.demoSeeded = true
	saveState({ immediate: true })
}

export function addVideos(list = [], options = {}) {
	initStore()
	const incoming = (Array.isArray(list) ? list : []).map(normalizeVideo).filter((v) => v.url)
	if (!incoming.length) return 0
	const incomingHasReal = incoming.some((video) => !video.demo)
	let base = state.videos
	if (options.replaceDemos && incomingHasReal && base.length && base.every((video) => video.demo)) {
		base = []
		state.progress = {}
		if (DEMO_IDS.includes(state.lastPlayedId)) state.lastPlayedId = ''
	}
	const byId = new Map(base.map((video) => [video.id, video]))
	for (const video of incoming) {
		const existing = byId.get(video.id)
		byId.set(video.id, existing ? { ...existing, ...video, addedAt: existing.addedAt || Date.now() } : video)
	}
	state.videos = Array.from(byId.values())
	state.libraryUpdatedAt = Date.now()
	saveState({ immediate: true })
	return incoming.length
}

export function removeVideo(id) {
	const index = state.videos.findIndex((video) => video.id === id)
	if (index === -1) return
	state.videos.splice(index, 1)
	delete state.progress[id]
	if (state.lastPlayedId === id) state.lastPlayedId = ''
	state.queue = state.queue.filter((queueId) => queueId !== id)
	saveState({ immediate: true })
}

export function clearLibrary() {
	state.videos = []
	state.progress = {}
	state.history = []
	state.lastPlayedId = ''
	state.queue = []
	state.currentId = ''
	state.libraryUpdatedAt = 0
	state.previewSeeded = true
	saveState({ immediate: true })
}

export function getVideoById(id) {
	return videosById.value.get(id) || null
}

export function setLastTab(tab) {
	state.lastTab = tab
	saveSoon()
}

export function setQueue(ids = [], currentId = '') {
	state.queue = ids.slice()
	const index = state.queue.indexOf(currentId)
	state.queueIndex = index >= 0 ? index : 0
	state.currentId = currentId
	saveSoon()
}

export function setCurrent(id) {
	state.currentId = id
	const index = state.queue.indexOf(id)
	if (index >= 0) state.queueIndex = index
	state.lastPlayedId = id
	saveSoon()
}

export function markPlayed(video) {
	if (!video) return
	state.lastPlayedId = video.id
	state.currentId = video.id
	const now = Date.now()
	const existing = state.progress[video.id]
	const entry = {
		id: video.id,
		title: video.title,
		name: video.name,
		folder: video.folder,
		thumb: video.thumb,
		duration: Number(video.duration) || Number(existing?.duration) || 0,
		position: Number(existing?.position) || 0,
		percent: Number(existing?.percent) || 0,
		completed: !!existing?.completed,
		updatedAt: now,
		demo: !!video.demo
	}
	state.progress[video.id] = { ...existing, ...entry }
	state.history = [entry, ...state.history.filter((item) => item.id !== video.id)].slice(0, MAX_PROGRESS_ENTRIES)
	saveSoon()
}

export function recordProgress(video, position, duration, options = {}) {
	if (!video) return
	if (!state.settings.rememberProgress && !options.completed) return
	const total = Number(duration) || Number(video.duration) || 0
	if (!Number.isFinite(total) || total <= 0) return
	const pos = !!options.completed ? total : clamp(position, 0, total)
	if (pos < 1 && !options.completed) return
	// A pause within the last couple of seconds should still count as finished,
	// otherwise switching to the next episode would overwrite the completed flag.
	const completed = !!options.completed || pos >= total - 1.5
	const storedPosition = completed ? total : pos
	const percent = completed ? 1 : clamp(pos / total, 0, 1)
	const previous = state.progress[video.id] || {}
	const entry = {
		id: video.id,
		title: video.title,
		name: video.name,
		folder: video.folder,
		thumb: video.thumb,
		duration: total,
		position: storedPosition,
		percent,
		completed,
		updatedAt: Date.now(),
		demo: !!video.demo
	}
	state.progress[video.id] = { ...previous, ...entry }
	state.lastPlayedId = video.id
	state.history = [entry, ...state.history.filter((item) => item.id !== video.id)].slice(0, MAX_PROGRESS_ENTRIES)
	saveProgressSoon(video.id)
}

export function resetProgress(id) {
	delete state.progress[id]
	state.history = state.history.filter((item) => item.id !== id)
	if (state.lastPlayedId === id) state.lastPlayedId = ''
	saveState({ immediate: true })
}

export function getProgress(id) {
	return state.progress[id] || null
}

export function getResumePosition(video) {
	if (!video || !state.settings.rememberProgress) return 0
	const entry = state.progress[video.id]
	if (!entry || entry.completed) return 0
	const total = Number(video.duration) || Number(entry.duration) || 0
	if (!total || entry.position < 2 || entry.position >= total - 4) return 0
	return entry.position
}

export function progressPercent(video) {
	if (!video) return 0
	const entry = state.progress[video.id]
	if (!entry) return 0
	const total = Number(video.duration) || Number(entry.duration) || 0
	return total > 0 ? clamp(entry.position / total, 0, 1) : 0
}

export function getContinueInfo() {
	initStore()
	const candidates = Object.values(state.progress)
		.filter((entry) => !entry.completed && Number(entry.percent) > 0.02 && Number(entry.percent) < 0.97)
		.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
	const latest = candidates[0]
	if (!latest) {
		if (!state.lastPlayedId) return null
		const last = state.progress[state.lastPlayedId]
		if (!last) return null
		// Opening a file and closing it after two seconds should not turn the
		// hero into a "resume 0%" card. Only a meaningful position or a
		// completed watch counts as a resume candidate.
		if (!last.completed && Number(last.percent) < 0.02) return null
		return {
			video: getVideoById(last.id),
			entry: last,
			percent: last.completed ? 1 : Number(last.percent) || 0,
			completed: !!last.completed
		}
	}
	return {
		video: getVideoById(latest.id),
		entry: latest,
		percent: Number(latest.percent) || 0,
		completed: false
	}
}

export function setSetting(key, value) {
	state.settings[key] = value
	saveSoon()
}

export function setSettings(patch = {}) {
	Object.assign(state.settings, patch)
	saveSoon()
}

export function setScanning(scanning, label = '正在读取本地视频…', progress = 0) {
	state.scanning = scanning
	state.scanLabel = label
	state.scanProgress = progress
}

export function updateScanProgress(progress, label) {
	state.scanProgress = clamp(progress, 0, 100)
	if (label) state.scanLabel = label
}

export function showToast(message, type = 'default', duration = 2300) {
	if (toastTimer) clearTimeout(toastTimer)
	state.toast.message = message
	state.toast.type = type
	state.toast.visible = true
	toastTimer = setTimeout(() => {
		state.toast.visible = false
		toastTimer = null
	}, duration)
}

export function hideToast() {
	if (toastTimer) clearTimeout(toastTimer)
	toastTimer = null
	state.toast.visible = false
}

export function useVideoStore() {
	initStore()
	const sortedVideos = computed(() => {
		const key = state.settings.sortKey
		const direction = state.settings.sortDir === 'asc' ? 1 : -1
		const list = state.videos.slice()
		list.sort((a, b) => {
			if (key === 'name') return compareFileNames(a.name || a.title, b.name || b.title) * direction
			if (key === 'duration') return ((a.duration || 0) - (b.duration || 0)) * direction
			if (key === 'size') return ((a.size || 0) - (b.size || 0)) * direction
			return ((a.addedAt || a.modified || 0) - (b.addedAt || b.modified || 0)) * direction
		})
		return list
	})
	const totalDuration = computed(() => state.videos.reduce((sum, video) => sum + (Number(video.duration) || 0), 0))
	const totalSize = computed(() => state.videos.reduce((sum, video) => sum + (Number(video.size) || 0), 0))
	const continueInfo = computed(() => getContinueInfo())
	const lastPlayed = computed(() => {
		if (state.lastPlayedId) {
			const video = getVideoById(state.lastPlayedId)
			if (video) return video
		}
		return sortedVideos.value[0] || null
	})
	const formattedTotalDuration = computed(() => formatDuration(totalDuration.value, '0:00'))
	return {
		state,
		sortedVideos,
		totalDuration,
		totalSize,
		continueInfo,
		lastPlayed,
		formattedTotalDuration
	}
}
