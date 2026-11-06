const bounded = (value, minimum = 0) => Math.min(1, Math.max(minimum, Number(value) || 0))

export function createAppPlaybackAdjustments() {
	const originalBrightness = bounded(plus.screen.getBrightness(), 0.05)
	let originalOverride = null
	let window = null
	let chosenBrightness = null
	let brightnessApplied = false
	try {
		if (plus.android) {
			window = plus.android.invoke(plus.android.runtimeMainActivity(), 'getWindow')
			const attributes = plus.android.invoke(window, 'getAttributes')
			const value = Number(plus.android.getAttribute(attributes, 'screenBrightness'))
			if (Number.isFinite(value)) originalOverride = value
		}
	} catch (error) { /* other platforms restore the original brightness value */ }
	return {
		read() {
			return { volume: bounded(plus.device.getVolume()), brightness: bounded(plus.screen.getBrightness(), 0.05) }
		},
		setVolume(value) {
			plus.device.setVolume(bounded(value))
			return bounded(plus.device.getVolume())
		},
		setBrightness(value) {
			const brightness = bounded(value, 0.05)
			plus.screen.setBrightness(brightness)
			chosenBrightness = brightness
			brightnessApplied = true
			return brightness
		},
		restoreBrightness() {
			if (!brightnessApplied) return
			try {
				if (window && originalOverride !== null) {
					const attributes = plus.android.invoke(window, 'getAttributes')
					plus.android.setAttribute(attributes, 'screenBrightness', originalOverride)
					plus.android.invoke(window, 'setAttributes', attributes)
				} else plus.screen.setBrightness(originalBrightness)
				brightnessApplied = false
			} catch (error) {
				try { plus.screen.setBrightness(originalBrightness); brightnessApplied = false } catch (ignored) { /* closing activity */ }
			}
		},
		resume() {
			if (chosenBrightness !== null && !brightnessApplied) {
				plus.screen.setBrightness(chosenBrightness)
				brightnessApplied = true
			}
		}
	}
}
