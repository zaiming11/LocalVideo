<template>
	<view v-if="toast.visible" class="app-toast" :class="`is-${toast.type}`">
		<view class="toast-icon">
			<AppIcon :name="toast.type === 'success' ? 'check' : toast.type === 'error' ? 'x' : 'info'" :size="13" :color="toast.type === 'error' ? '#1a0909' : '#0a0d0a'" :stroke="2.4" />
		</view>
		<text class="toast-text">{{ toast.message }}</text>
	</view>
</template>

<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { initStore, useVideoStore } from '../core/store.js'

initStore()
const { state } = useVideoStore()
const toast = computed(() => state.toast)
</script>

<style scoped>
.app-toast {
	position: fixed;
	top: calc(var(--safe-top) + 18px);
	left: 50%;
	z-index: 3000;
	display: flex;
	align-items: center;
	gap: 9px;
	max-width: min(86vw, 420px);
	padding: 9px 15px 9px 9px;
	border-radius: 999px;
	background: rgba(244, 246, 241, 0.96);
	color: #0a0d0a;
	box-shadow: 0 12px 36px rgba(0, 0, 0, 0.32);
	transform: translateX(-50%);
	animation: toast-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
	pointer-events: none;
}

.is-error {
	background: #ffb4a8;
	color: #1a0909;
}

.is-success {
	background: var(--accent);
	color: #0a0d0a;
}

.toast-icon {
	width: 22px;
	height: 22px;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.12);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.toast-text {
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0.01em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

@keyframes toast-in {
	from { opacity: 0; transform: translate(-50%, -8px) scale(0.96); }
	to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
</style>
