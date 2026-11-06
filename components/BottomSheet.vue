<template>
	<view v-if="visible" class="sheet-layer" @click="$emit('close')">
		<view class="sheet-panel" @click.stop>
			<view class="sheet-grabber" />
			<view class="sheet-head">
				<view class="sheet-heading">
					<text v-if="kicker" class="section-kicker">{{ kicker }}</text>
					<text class="sheet-title">{{ title }}</text>
					<text v-if="subtitle" class="sheet-sub">{{ subtitle }}</text>
				</view>
				<view class="sheet-close press" @click="$emit('close')">
					<AppIcon name="x" :size="16" color="#9aa196" />
				</view>
			</view>
			<view class="sheet-body">
				<slot />
			</view>
			<view class="sheet-footer safe-bottom">
				<slot name="footer" />
			</view>
		</view>
	</view>
</template>

<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
	visible: { type: Boolean, default: false },
	title: { type: String, default: '' },
	subtitle: { type: String, default: '' },
	kicker: { type: String, default: '' }
})
defineEmits(['close'])
</script>

<style scoped>
.sheet-layer {
	position: fixed;
	inset: 0;
	z-index: 1500;
	background: rgba(2, 4, 3, 0.66);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	display: flex;
	align-items: flex-end;
	justify-content: center;
	animation: layer-in 0.18s ease;
}

.sheet-panel {
	width: 100%;
	max-width: 620px;
	max-height: 86vh;
	overflow-y: auto;
	background: #121518;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-bottom: 0;
	border-radius: 28px 28px 0 0;
	padding: 8px 22px 0;
	box-shadow: 0 -24px 80px rgba(0, 0, 0, 0.5);
	animation: sheet-up 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.sheet-grabber {
	width: 38px;
	height: 4px;
	border-radius: 99px;
	background: rgba(255, 255, 255, 0.16);
	margin: 4px auto 20px;
}

.sheet-head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 16px;
	margin-bottom: 18px;
}

.sheet-heading { display: flex; flex-direction: column; gap: 4px; }
.sheet-title { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; }
.sheet-sub { color: var(--muted); font-size: 12px; margin-top: 2px; }

.sheet-close {
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.06);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.sheet-body { padding-bottom: 8px; }
.sheet-footer { padding-top: 8px; }

@keyframes layer-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes sheet-up { from { transform: translateY(30px); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }

@media (min-width: 760px) {
	.sheet-layer { align-items: center; }
	.sheet-panel {
		border-radius: 26px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		max-height: 78vh;
		animation: panel-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes panel-in { from { transform: translateY(16px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
}
</style>
