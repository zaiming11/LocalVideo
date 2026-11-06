<template>
	<view class="video-card press" :class="[`is-${variant}`, { 'is-current': current }]" @click="$emit('open', video)">
		<view class="poster" :class="{ 'poster--list': variant === 'list' }">
			<image
				v-if="video.thumb && !thumbError"
				class="poster-img"
				:src="video.thumb"
				mode="aspectFill"
				@error="onThumbError"
			/>
			<view v-else class="poster-fallback" :style="fallbackStyle">
				<view class="fallback-glow" :style="{ background: `radial-gradient(circle at 76% 18%, ${video.accent}55, transparent 58%)` }" />
				<view class="fallback-mark">
					<AppIcon name="film" :size="26" :color="video.accent || '#E8FF63'" :stroke="1.4" />
				</view>
				<text class="fallback-letter">{{ initial }}</text>
				<view class="fallback-lines">
					<view class="fallback-line w-70" />
					<view class="fallback-line w-40" />
				</view>
			</view>
			<view class="poster-shade" />
			<view class="poster-top">
				<view class="format-chip">{{ extLabel(video.ext) }}</view>
				<view v-if="video.demo" class="demo-chip">演示</view>
			</view>
			<view class="poster-bottom">
				<view v-if="video.episode" class="episode-tag">EP {{ String(video.episode).padStart(2, '0') }}</view>
				<view class="duration-chip mono">{{ formatDuration(video.duration) }}</view>
			</view>
			<view class="play-hint" :class="{ 'play-hint--list': variant === 'list' }">
				<AppIcon name="play" :size="variant === 'list' ? 12 : 14" color="#0A0D0A" />
			</view>
			<view v-if="progress > 0" class="progress-track">
				<view class="progress-fill" :style="{ width: `${Math.min(100, progress * 100)}%` }" />
			</view>
		</view>

		<view class="card-copy">
			<view class="title-row">
				<text class="card-title clamp-1">{{ video.title }}</text>
				<view v-if="current" class="playing-bars">
					<view /><view /><view />
				</view>
			</view>
			<view class="meta-row">
				<text class="meta-text">{{ video.folder || '未分类' }}</text>
				<view class="dot" />
				<text class="meta-text">{{ formatBytes(video.size) }}</text>
			</view>
			<view v-if="variant === 'list'" class="list-extra">
				<text class="list-duration mono">{{ formatDuration(video.duration) }}</text>
				<text class="list-sep">·</text>
				<text class="list-date">{{ formatDate(video.addedAt || video.modified) }}</text>
			</view>
			<view v-if="progress > 0" class="continue-label">
				<text class="continue-dot" />
				<text>已观看 {{ Math.round(progress * 100) }}%</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { extLabel, formatBytes, formatDate, formatDuration } from '../core/utils.js'

const props = defineProps({
	video: { type: Object, required: true },
	variant: { type: String, default: 'grid' },
	progress: { type: Number, default: 0 },
	current: { type: Boolean, default: false }
})
defineEmits(['open'])

const thumbError = ref(false)
watch(() => props.video.id, () => { thumbError.value = false })

const initial = computed(() => (props.video.title || '影').slice(0, 1))
const fallbackStyle = computed(() => ({
	background: `linear-gradient(135deg, ${props.video.from || '#17302f'} 0%, ${props.video.to || '#080b0c'} 100%)`
}))

function onThumbError() {
	thumbError.value = true
}
</script>

<style scoped>
.video-card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	cursor: pointer;
	min-width: 0;
}

.poster {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 9;
	overflow: hidden;
	border-radius: 14px;
	background: #11161a;
	border: 1px solid rgba(255, 255, 255, 0.07);
	box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
	transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.24s ease, box-shadow 0.24s ease;
}

.video-card:hover .poster {
	transform: translateY(-3px);
	border-color: rgba(255, 255, 255, 0.18);
	box-shadow: 0 22px 50px rgba(0, 0, 0, 0.36);
}

.video-card.is-current .poster {
	border-color: rgba(232, 255, 99, 0.52);
	box-shadow: 0 0 0 1px rgba(232, 255, 99, 0.14), 0 20px 44px rgba(0, 0, 0, 0.34);
}

.poster-img {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.poster-fallback {
	position: absolute;
	inset: 0;
	overflow: hidden;
}

.fallback-glow { position: absolute; inset: 0; }
.fallback-mark {
	position: absolute;
	top: 18%;
	right: 9%;
	width: 44px;
	height: 44px;
	border-radius: 50%;
	border: 1px solid rgba(255, 255, 255, 0.13);
	background: rgba(0, 0, 0, 0.15);
	display: flex;
	align-items: center;
	justify-content: center;
}
.fallback-letter {
	position: absolute;
	left: 8%;
	bottom: 12%;
	font-size: 46px;
	font-weight: 900;
	line-height: 1;
	color: rgba(255, 255, 255, 0.12);
	letter-spacing: -0.08em;
}
.fallback-lines {
	position: absolute;
	left: 8%;
	bottom: 34%;
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.fallback-line { height: 4px; border-radius: 4px; background: rgba(255, 255, 255, 0.16); }
.fallback-line.w-70 { width: 68px; }
.fallback-line.w-40 { width: 38px; }

.poster-shade {
	position: absolute;
	inset: 0;
	background: linear-gradient(180deg, rgba(4, 6, 7, 0.02) 32%, rgba(4, 6, 7, 0.78) 100%);
	pointer-events: none;
}

.poster-top {
	position: absolute;
	top: 10px;
	left: 10px;
	right: 10px;
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.format-chip,
.demo-chip,
.episode-tag,
.duration-chip {
	font-size: 9px;
	font-weight: 800;
	letter-spacing: 0.08em;
	border-radius: 6px;
	padding: 4px 6px;
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
}

.format-chip {
	color: rgba(255, 255, 255, 0.9);
	background: rgba(4, 7, 7, 0.52);
	border: 1px solid rgba(255, 255, 255, 0.12);
}

.demo-chip {
	color: #121509;
	background: rgba(232, 255, 99, 0.9);
	margin-left: auto;
}

.poster-bottom {
	position: absolute;
	left: 10px;
	right: 10px;
	bottom: 10px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.episode-tag {
	color: rgba(255, 255, 255, 0.86);
	background: rgba(4, 7, 7, 0.48);
	border: 1px solid rgba(255, 255, 255, 0.1);
}

.duration-chip {
	color: #fff;
	background: rgba(4, 7, 7, 0.62);
	border: 1px solid rgba(255, 255, 255, 0.1);
	margin-left: auto;
}

.play-hint {
	position: absolute;
	top: 50%;
	left: 50%;
	width: 48px;
	height: 48px;
	margin: -24px 0 0 -24px;
	border-radius: 50%;
	background: rgba(232, 255, 99, 0.92);
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transform: scale(0.82);
	transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
	box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
}

.video-card:hover .play-hint {
	opacity: 1;
	transform: scale(1);
}

.progress-track {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 3px;
	background: rgba(255, 255, 255, 0.16);
}

.progress-fill {
	height: 100%;
	background: var(--accent);
	border-radius: 0 3px 3px 0;
}

.card-copy { min-width: 0; padding: 0 1px; }

.title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.card-title {
	font-size: 14.5px;
	font-weight: 700;
	letter-spacing: -0.015em;
	color: var(--text);
	flex: 1;
	min-width: 0;
}

.meta-row {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 4px;
	min-width: 0;
	overflow: hidden;
}

.meta-text {
	font-size: 10.5px;
	color: var(--muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.continue-label {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 10px;
	color: var(--accent);
	margin-top: 6px;
	font-weight: 600;
}

.continue-dot {
	width: 4px;
	height: 4px;
	border-radius: 50%;
	background: var(--accent);
}

.playing-bars {
	display: flex;
	align-items: flex-end;
	gap: 2px;
	height: 12px;
	flex-shrink: 0;
}
.playing-bars view {
	width: 2.5px;
	background: var(--accent);
	border-radius: 2px;
	animation: bars 0.9s ease-in-out infinite;
}
.playing-bars view:nth-child(1) { height: 55%; animation-delay: -0.2s; }
.playing-bars view:nth-child(2) { height: 100%; animation-delay: -0.5s; }
.playing-bars view:nth-child(3) { height: 72%; animation-delay: -0.1s; }

@keyframes bars {
	0%, 100% { transform: scaleY(0.55); }
	50% { transform: scaleY(1); }
}

/* List layout */
.video-card.is-list {
	flex-direction: row;
	align-items: stretch;
	gap: 13px;
	padding: 9px;
	border-radius: 14px;
	border: 1px solid transparent;
	transition: background 0.18s ease, border-color 0.18s ease;
}
.video-card.is-list:hover {
	background: rgba(255, 255, 255, 0.035);
	border-color: rgba(255, 255, 255, 0.07);
}
.video-card.is-list .poster {
	width: 142px;
	flex-shrink: 0;
	border-radius: 10px;
}
.video-card.is-list .card-copy {
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-width: 0;
	flex: 1;
}
.video-card.is-list .card-title { font-size: 15px; }
.video-card.is-list .meta-row { margin-top: 5px; }
.video-card.is-list .play-hint {
	width: 34px;
	height: 34px;
	margin: -17px 0 0 -17px;
}
.video-card.is-list .format-chip,
.video-card.is-list .demo-chip { font-size: 8px; padding: 3px 5px; }
.video-card.is-list .poster-top { top: 7px; left: 7px; right: 7px; }
.video-card.is-list .poster-bottom { left: 7px; right: 7px; bottom: 7px; }
.video-card.is-list .episode-tag { display: none; }

.list-extra {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 6px;
	font-size: 10.5px;
	color: var(--dim);
}
.list-duration { color: var(--text-2); }
.list-sep { color: var(--dim); }

@media (max-width: 380px) {
	.video-card.is-list .poster { width: 120px; }
}

@media (min-width: 760px) {
	.card-title { font-size: 15px; }
}
</style>
