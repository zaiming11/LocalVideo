<template>
	<view class="icon-wrap" :style="iconStyle">
		<image class="icon-image" :src="iconSrc" :style="iconStyle" mode="aspectFit" />
	</view>
</template>

<script setup>
import { computed } from 'vue'

const ICONS = {
	play: '<path d="M8 5.2v13.6L19 12 8 5.2Z" fill="currentColor" stroke="none"/>',
	pause: '<rect x="7" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
	next: '<path d="M6 5.5 15 12l-9 6.5V5.5Z" fill="currentColor" stroke="none"/><path d="M18.5 5v14"/>',
	prev: '<path d="M18 5.5 9 12l9 6.5V5.5Z" fill="currentColor" stroke="none"/><path d="M5.5 5v14"/>',
	'arrow-left': '<path d="M15 19l-7-7 7-7"/><path d="M8 12h12"/>',
	'arrow-right': '<path d="M9 5l7 7-7 7"/><path d="M4 12h12"/>',
	'chevron-down': '<path d="M6 9l6 6 6-6"/>',
	'chevron-up': '<path d="M6 15l6-6 6 6"/>',
	'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
	'chevron-right': '<path d="M9 6l6 6-6 6"/>',
	search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
	sort: '<path d="M4 7h10"/><path d="M4 12h7"/><path d="M4 17h4"/><path d="M18 5v14"/><path d="M15 16l3 3 3-3"/>',
	folder: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z"/>',
	grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>',
	list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
	film: '<rect x="3.5" y="5" width="17" height="14" rx="2.4"/><path d="M7.5 5v14"/><path d="M16.5 5v14"/><path d="M3.5 9.5h4"/><path d="M3.5 14.5h4"/><path d="M16.5 9.5h4"/><path d="M16.5 14.5h4"/>',
	clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 2"/>',
	database: '<ellipse cx="12" cy="5.8" rx="7.5" ry="3"/><path d="M4.5 5.8v12.4c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5.8"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
	settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.1 1.5 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.35.7.6 1 .3.27.68.4 1.1.4h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.7.6Z"/>',
	check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
	x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
	volume: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
	'volume-x': '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/>',
	maximize: '<path d="M8.5 4H4v4.5"/><path d="M15.5 4H20v4.5"/><path d="M8.5 20H4v-4.5"/><path d="M15.5 20H20v-4.5"/>',
	minimize: '<path d="M4 8.5h4.5V4"/><path d="M20 8.5h-4.5V4"/><path d="M4 15.5h4.5V20"/><path d="M20 15.5h-4.5V20"/>',
	playlist: '<path d="M4 6h11"/><path d="M4 11h8"/><path d="M4 16h6"/><path d="M17 11.5v7.2"/><path d="M14.5 16.2l2.5 1.5 2.5-1.5"/>',
	gauge: '<path d="M4.2 17a8.5 8.5 0 1 1 15.6 0"/><path d="M12 13.5l3.7-3.7"/><circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none"/>',
	more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
	plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
	refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.6L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.7 4.6L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
	upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 16v3a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-3"/>',
	trash: '<path d="M4 7h16"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M6.5 7l.8 12.1A1.9 1.9 0 0 0 9.2 21h5.6a1.9 1.9 0 0 0 1.9-1.9L17.5 7"/><path d="M10 11v5.5"/><path d="M14 11v5.5"/>',
	info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
	sparkles: '<path d="M12 3.5l1.4 4.1 4.1 1.4-4.1 1.4L12 14.5l-1.4-4.1L6.5 9l4.1-1.4L12 3.5Z"/><path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="M5 15l.6 1.7 1.7.6-1.7.6L5 19.6l-.6-1.7-1.7-.6 1.7-.6L5 15Z"/>',
	fullscreen: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
	'fullscreen-exit': '<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>',
	rotate: '<path d="M4 10a8 8 0 0 1 13.7-5.7L20 6.5"/><path d="M20 3v4.5h-4.5"/><path d="M20 14a8 8 0 0 1-13.7 5.7L4 17.5"/><path d="M4 21v-4.5h4.5"/>',
	'rotate-ccw': '<path d="M4 9V4h5"/><path d="M4.6 8.5A8 8 0 1 1 5.8 18"/>',
	'rotate-cw': '<path d="M20 9V4h-5"/><path d="M19.4 8.5A8 8 0 1 0 18.2 18"/>',
	logo: '<rect x="3" y="5" width="18" height="14" rx="4" fill="currentColor" stroke="none"/><path d="M8 9.2v5.6l4.5-2.8L8 9.2Z" fill="#080A09" stroke="none"/><path d="M15 8.5v7" stroke="#080A09" stroke-width="1.8"/><circle cx="17.5" cy="8.5" r=".9" fill="#080A09" stroke="none"/><circle cx="17.5" cy="15.5" r=".9" fill="#080A09" stroke="none"/>',
	phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 5h3"/><circle cx="12" cy="18" r=".9" fill="currentColor" stroke="none"/>',
	cloud: '<path d="M7 18h10.5a3.5 3.5 0 0 0 .4-6.98A6 6 0 0 0 6.3 9.5 4.25 4.25 0 0 0 7 18Z"/>',
	shield: '<path d="M12 3l7 3v5.5c0 4.4-2.9 7.7-7 9.5-4.1-1.8-7-5.1-7-9.5V6l7-3Z"/><path d="M9 12l2 2 4-4"/>',
	eye: '<path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.8"/>',
	'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
	download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
	subtitles: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7 11h4"/><path d="M13 11h4"/><path d="M7 15h6"/><path d="M15 15h2"/>'
}

const iconCache = new Map()

const props = defineProps({
	name: { type: String, required: true },
	size: { type: [Number, String], default: 20 },
	color: { type: String, default: '#F5F7F2' },
	stroke: { type: [Number, String], default: 1.8 }
})

const iconSrc = computed(() => {
	const key = `${props.name}|${props.color}|${props.stroke}`
	if (iconCache.has(key)) return iconCache.get(key)
	const body = ICONS[props.name] || ICONS.film
	// App 端的 JavaScript 引擎可能不支持 String.prototype.replaceAll。
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${props.color}" stroke-width="${props.stroke}" stroke-linecap="round" stroke-linejoin="round">${body.replace(/currentColor/g, props.color)}</svg>`
	const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
	iconCache.set(key, src)
	return src
})

const iconStyle = computed(() => {
	const px = typeof props.size === 'number' ? `${props.size}px` : props.size
	return { width: px, height: px, flexShrink: 0 }
})
</script>

<style scoped>
.icon-wrap { display: flex; align-items: center; justify-content: center; }
.icon-image { display: block; flex-shrink: 0; }
</style>
