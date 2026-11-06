import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAppPlaybackAdjustments } from '../core/app-playback-adjustments.js'

function fixture(t, originalOverride = -1) {
	const previous = globalThis.plus
	t.after(() => { globalThis.plus = previous })
	const native = { volume: 0.4, systemBrightness: 0.6, brightnessOverride: originalOverride, changes: 0 }
	globalThis.plus = {
		device: { getVolume: () => native.volume, setVolume: (value) => { native.volume = value } },
		screen: { getBrightness: () => native.brightnessOverride < 0 ? native.systemBrightness : native.brightnessOverride, setBrightness: (value) => { native.brightnessOverride = value; native.changes++ } },
		android: {
			runtimeMainActivity: () => 'activity',
			invoke(target, method, attributes) {
				if (target === 'activity' && method === 'getWindow') return 'window'
				if (target === 'window' && method === 'getAttributes') return { screenBrightness: native.brightnessOverride }
				if (target === 'window' && method === 'setAttributes') { native.brightnessOverride = attributes.screenBrightness; native.changes++; return }
				throw new Error(`Unexpected native call: ${method}`)
			},
			getAttribute: (object, key) => object[key],
			setAttribute: (object, key, value) => { object[key] = value }
		}
	}
	return native
}

test('volume includes mute and brightness stays readable; leaving restores system-controlled brightness', (t) => {
	const native = fixture(t)
	const controls = createAppPlaybackAdjustments()
	assert.deepEqual(controls.read(), { volume: 0.4, brightness: 0.6 })
	assert.equal(controls.setVolume(0), 0)
	assert.equal(controls.setVolume(2), 1)
	assert.equal(controls.setBrightness(0), 0.05)
	assert.equal(controls.setBrightness(2), 1)
	controls.restoreBrightness()
	assert.equal(native.brightnessOverride, -1)
	assert.equal(native.systemBrightness, 0.6)
	const writes = native.changes
	controls.restoreBrightness()
	assert.equal(native.changes, writes)
	controls.resume()
	assert.equal(native.brightnessOverride, 1)
	controls.restoreBrightness()
	assert.equal(native.brightnessOverride, -1)
})

test('an existing window brightness override is preserved and no brightness changes occur until requested', (t) => {
	const native = fixture(t, 0.3)
	const controls = createAppPlaybackAdjustments()
	controls.restoreBrightness()
	controls.resume()
	assert.equal(native.changes, 0)
	controls.setBrightness(0.8)
	controls.restoreBrightness()
	assert.equal(native.brightnessOverride, 0.3)
})
