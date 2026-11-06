import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getAndroidPlayStrategy } from '../core/android-playback.js'

function fixture(t, tracks, fail = false) {
	const previousPlus = globalThis.plus
	t.after(() => { globalThis.plus = previousPlus })
	const stats = { opened: 0, released: 0 }
	const extractor = { type: 'extractor' }
	globalThis.plus = { android: {
		newObject(name) { assert.equal(name, 'android.media.MediaExtractor'); stats.opened++; return extractor },
		runtimeMainActivity: () => 'activity',
		invoke(target, method, ...args) {
			if (target === 'android.net.Uri' && method === 'parse') return { uri: args[0] }
			if (target === extractor) {
				if (method === 'setDataSource') { if (fail) throw new Error('Read failed'); assert.equal(args[0], 'activity'); return }
				if (method === 'getTrackCount') return tracks.length
				if (method === 'getTrackFormat') return { mime: tracks[args[0]] }
				if (method === 'release') { stats.released++; return }
			}
			if (method === 'getString' && args[0] === 'mime') return target.mime
			throw new Error(`Unexpected native call: ${method}`)
		}
	} }
	return stats
}

test('HEVC selects the hardware-capable strategy and reuses the probe for unchanged files', (t) => {
	const stats = fixture(t, ['audio/mp4a-latm', 'video/hevc'])
	const video = { url: 'content://tests/hevc', size: 100, modified: 1 }
	assert.equal(getAndroidPlayStrategy(video), 1)
	assert.equal(getAndroidPlayStrategy(video), 1)
	assert.equal(stats.opened, 1)
	assert.equal(stats.released, 1)
	assert.equal(getAndroidPlayStrategy({ ...video, modified: 2 }), 1)
	assert.equal(stats.opened, 2)
})

test('AVC keeps normal local playback and remote sources do not trigger a native file probe', (t) => {
	const stats = fixture(t, ['video/avc'])
	assert.equal(getAndroidPlayStrategy({ url: 'content://tests/avc' }), 0)
	assert.equal(getAndroidPlayStrategy({ url: 'https://example.com/video.mp4' }), 0)
	assert.equal(stats.opened, 1)
	assert.equal(stats.released, 1)
})

test('failed metadata reads release the extractor and can retry later', (t) => {
	const stats = fixture(t, [], true)
	assert.equal(getAndroidPlayStrategy({ url: 'content://tests/unavailable' }), 0)
	assert.equal(getAndroidPlayStrategy({ url: 'content://tests/unavailable' }), 0)
	assert.equal(stats.opened, 2)
	assert.equal(stats.released, 2)
})
