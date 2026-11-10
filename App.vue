<script>
	import { initStore, saveState } from './core/store.js'
	import { checkForUpdates } from './core/update/client.js'

	export default {
		onLaunch() {
			// #ifdef APP-PLUS
			plus.navigator.setFullscreen(false)
			plus.screen.lockOrientation('portrait-primary')
			// #endif
			initStore()
			setTimeout(() => checkForUpdates(true), 8000)
			console.log('[LocalCinema] launch')
		},
		onShow() {
			initStore()
		},
		onHide() {
			saveState({ immediate: true })
		}
	}
</script>

<style>
	@import './common/theme.css';
</style>
