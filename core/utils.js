export const VIDEO_EXTENSIONS = [
	'mp4', 'm4v', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'webm', 'ts', 'm2ts',
	'mpg', 'mpeg', '3gp', 'ogv', 'rmvb', 'rm', 'asf', 'vob', 'f4v'
]

const EXT_LABELS = {
	mp4: 'MP4', m4v: 'M4V', mov: 'MOV', mkv: 'MKV', avi: 'AVI', flv: 'FLV',
	wmv: 'WMV', webm: 'WEBM', ts: 'TS', m2ts: 'M2TS', mpg: 'MPG', mpeg: 'MPEG',
	'3gp': '3GP', ogv: 'OGV', rmvb: 'RMVB', rm: 'RM', asf: 'ASF', vob: 'VOB', f4v: 'F4V'
}

const PALETTES = [
	{ from: '#163A3A', to: '#0A1618', accent: '#8EF0D2' },
	{ from: '#3A2417', to: '#17100C', accent: '#FFB477' },
	{ from: '#2B1B3D', to: '#110B1A', accent: '#DDA7FF' },
	{ from: '#1B2E43', to: '#0B121A', accent: '#8CC8FF' },
	{ from: '#3A1D28', to: '#170D12', accent: '#FF9AB1' },
	{ from: '#2C3218', to: '#11140B', accent: '#D9F28B' }
]

export function clamp(value, min, max) {
	return Math.min(max, Math.max(min, Number(value) || 0))
}

export function getExtension(name = '') {
	const clean = String(name).split('?')[0].split('#')[0]
	const dot = clean.lastIndexOf('.')
	return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

export function extLabel(ext = '') {
	return EXT_LABELS[ext] || String(ext || 'VIDEO').toUpperCase()
}

export function isVideoFile(name = '', mime = '') {
	const ext = getExtension(name)
	return VIDEO_EXTENSIONS.includes(ext) || String(mime).startsWith('video/')
}

export function titleFromFilename(name = '') {
	let base = String(name).split('/').pop() || ''
	base = base.replace(/\.[^.]+$/, '')
	try {
		base = decodeURIComponent(base)
	} catch (e) { /* keep raw name */ }
	const title = base
		.replace(/[._]+/g, ' ')
		.replace(/\s*-\s*/g, ' · ')
		.replace(/第\s*([0-9]+)\s*季/g, ' 第 $1 季 ')
		.replace(/第\s*([0-9]+)\s*集/g, ' 第 $1 集 ')
		.replace(/第\s*([一二三四五六七八九十百]+)\s*季/g, ' 第$1季 ')
		.replace(/第\s*([一二三四五六七八九十百]+)\s*集/g, ' 第$1集 ')
		.replace(/\s{2,}/g, ' ')
		.trim()
	return title || '未命名视频'
}

export function formatDuration(seconds, placeholder = '--:--') {
	const total = Number(seconds)
	if (!Number.isFinite(total) || total <= 0) return placeholder
	const sec = Math.floor(total % 60)
	const min = Math.floor(total / 60) % 60
	const hour = Math.floor(total / 3600)
	const pad = (n) => String(n).padStart(2, '0')
	return hour > 0 ? `${hour}:${pad(min)}:${pad(sec)}` : `${pad(min)}:${pad(sec)}`
}

export function formatDurationLong(seconds) {
	const total = Number(seconds) || 0
	if (total <= 0) return '0 分钟'
	if (total < 60) return `${Math.max(1, Math.round(total))} 秒`
	const minutes = Math.floor(total / 60)
	const secs = Math.round(total % 60)
	if (minutes < 60) return secs ? `${minutes} 分 ${secs} 秒` : `${minutes} 分钟`
	const h = Math.floor(minutes / 60)
	const m = minutes % 60
	return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

export function formatBytes(bytes, decimals = 1) {
	const value = Number(bytes) || 0
	if (value <= 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
	const size = value / Math.pow(1024, i)
	return `${size.toFixed(i === 0 ? 0 : decimals).replace(/\.0$/, '')} ${units[i]}`
}

export function formatDate(timestamp) {
	const ts = Number(timestamp)
	if (!ts) return '未知时间'
	const date = new Date(ts)
	const now = new Date()
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
	const diff = startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
	const pad = (n) => String(n).padStart(2, '0')
	const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
	if (diff === 0) return `今天 ${time}`
	if (diff === 86400000) return `昨天 ${time}`
	if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`
	return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export function relativeTime(timestamp) {
	const ts = Number(timestamp)
	if (!ts) return ''
	const diff = Date.now() - ts
	if (diff < 60 * 1000) return '刚刚'
	if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
	if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
	if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`
	return formatDate(ts)
}

export function hashString(input = '') {
	let hash = 2166136261
	const str = String(input)
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

export function paletteFor(key = '') {
	return PALETTES[hashString(key) % PALETTES.length]
}

export function makeVideoId(name, size = 0, modified = 0, extra = '') {
	return `v_${hashString(`${name}|${size}|${modified}|${extra}`).toString(36)}`
}

export function svgPlaceholder(title = 'VIDEO', key = '', tag = 'VIDEO') {
	const palette = paletteFor(key || title)
	const safeTitle = String(title).slice(0, 16)
	const safeTag = String(tag || 'VIDEO').slice(0, 8)
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
		<defs>
			<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="${palette.from}"/>
				<stop offset="1" stop-color="${palette.to}"/>
			</linearGradient>
			<radialGradient id="r" cx="78%" cy="18%" r="70%">
				<stop offset="0" stop-color="${palette.accent}" stop-opacity=".38"/>
				<stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
			</radialGradient>
		</defs>
		<rect width="640" height="360" fill="url(#g)"/>
		<rect width="640" height="360" fill="url(#r)"/>
		<g fill="none" stroke="${palette.accent}" stroke-opacity=".22">
			<circle cx="550" cy="62" r="92"/>
			<circle cx="550" cy="62" r="62"/>
			<path d="M0 300 C 150 248, 300 340, 640 246"/>
		</g>
		<g transform="translate(48,250)">
			<text fill="#FFFFFF" fill-opacity=".92" font-family="sans-serif" font-size="32" font-weight="700">${escapeXml(safeTitle)}</text>
			<text y="30" fill="${palette.accent}" fill-opacity=".75" font-family="sans-serif" font-size="13" letter-spacing="4">${escapeXml(safeTag)}</text>
		</g>
		<g transform="translate(520,296)" fill="none" stroke="#FFFFFF" stroke-opacity=".32">
			<rect x="0" y="0" width="64" height="26" rx="13"/>
			<path d="M20 8l10 5-10 5z" fill="#FFFFFF" fill-opacity=".5" stroke="none"/>
		</g>
	</svg>`
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function escapeXml(str = '') {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

export function throttle(fn, wait = 200) {
	let last = 0
	let timer = null
	return function throttled(...args) {
		const now = Date.now()
		const remaining = wait - (now - last)
		if (remaining <= 0) {
			last = now
			if (timer) {
				clearTimeout(timer)
				timer = null
			}
			fn.apply(this, args)
		} else if (!timer) {
			timer = setTimeout(() => {
				last = Date.now()
				timer = null
				fn.apply(this, args)
			}, remaining)
		}
	}
}

export function debounce(fn, wait = 300) {
	let timer = null
	return function debounced(...args) {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => {
			timer = null
			fn.apply(this, args)
		}, wait)
	}
}

export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isH5() {
	// #ifdef H5
	return true
	// #endif
	// #ifndef H5
	return false
	// #endif
}

export function isApp() {
	// #ifdef APP-PLUS
	return true
	// #endif
	// #ifndef APP-PLUS
	return false
	// #endif
}

export function uid(prefix = 'id') {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function clampNumber(value, min, max) {
	return Math.min(max, Math.max(min, Number(value) || 0))
}
