import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanAndroidVideos } from '../core/media.js'

// Native.js can return opaque handles without Java methods on the JS object.
function androidFixture(t, rows = [], options = {}) {
	const activity = Object.freeze({ kind: 'activity' })
	const resolver = Object.freeze({ kind: 'resolver' })
	const cursor = Object.freeze({ kind: 'cursor' })
	const applicationInfo = Object.freeze({ kind: 'applicationInfo' })
	const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
	const state = { closed: 0, queried: 0, permissions: [], row: 0 }
	const previousPlus = globalThis.plus
	t.after(() => { globalThis.plus = previousPlus })
	globalThis.plus = {
		android: {
			runtimeMainActivity: () => activity,
			importClass(name) {
				if (name === 'android.os.Build$VERSION') return { SDK_INT: options.sdk || 35 }
				if (name === 'android.net.Uri') return { parse: (value) => ({ uri: value }) }
				throw new Error(`Unexpected class: ${name}`)
			},
			requestPermissions(permissions, success) {
				state.permissions = permissions
				success(options.denied ? { deniedAlways: permissions } : { granted: permissions })
			},
			getAttribute(handle, name) {
				assert.equal(handle, applicationInfo)
				assert.equal(name, 'targetSdkVersion')
				return options.targetSdk || 35
			},
			invoke(handle, method, ...args) {
				if (handle === activity && method === 'getContentResolver') return resolver
				if (handle === activity && method === 'getApplicationInfo') return applicationInfo
				if (handle === activity && method === 'checkSelfPermission') return options.granted ? 0 : -1
				if (handle === resolver && method === 'query') {
					state.queried++
					assert.deepEqual(args, [{ uri: 'content://media/external/video/media' }, null, null, null, null])
					if (options.queryError) throw new Error('MediaStore unavailable')
					return options.nullCursor ? null : cursor
				}
				assert.equal(handle, cursor)
				switch (method) {
					case 'getCount': return rows.length
					case 'moveToFirst': state.row = 0; return rows.length > 0
					case 'moveToNext':
						if (options.iterationError) throw new Error('Cursor disconnected')
						return ++state.row < rows.length
					case 'getColumnIndex': return columns.indexOf(args[0])
					case 'getString': return rows[state.row][columns[args[0]]] ?? null
					case 'getLong': return rows[state.row][columns[args[0]]] ?? 0
					case 'close': state.closed++; return
					default: throw new Error(`Unexpected native call: ${method}`)
				}
			}
		}
	}
	return state
}

test('scans opaque native handles and reads actual MediaStore columns', async (t) => {
	const native = androidFixture(t, [{
		_id: 42, _display_name: 'Episode 01.mkv', _size: 2048, _data: '/storage/emulated/0/Movies/Episode 01.mkv',
		mime_type: 'video/x-matroska', duration: 62000, date_modified: 1700000000, date_added: 1690000000,
		bucket_display_name: 'Movies', width: 1920, height: 1080
	}])
	const progress = []
	const [video] = await scanAndroidVideos((...value) => progress.push(value))
	assert.equal(video.name, 'Episode 01.mkv')
	assert.equal(video.size, 2048)
	assert.equal(video.folder, 'Movies')
	assert.equal(video.duration, 62)
	assert.equal(video.ext, 'mkv')
	assert.equal(video.mime, 'video/x-matroska')
	assert.equal(video.width, 1920)
	assert.equal(video.height, 1080)
	assert.equal(video.modified, 1700000000000)
	assert.equal(video.addedAt, 1690000000000)
	assert.equal(video.contentUri, 'content://media/external/video/media/42')
	assert.equal(video.filePath, '/storage/emulated/0/Movies/Episode 01.mkv')
	assert.deepEqual(progress, [[100, 1, 1]])
	assert.deepEqual(native.permissions, ['android.permission.READ_MEDIA_VIDEO'])
	assert.equal(native.closed, 1)
})

test('uses the pre-Android 13 permission and tolerates absent optional columns', async (t) => {
	const native = androidFixture(t, [{ _id: 7, _size: 1024, relative_path: 'Movies/Clips/' }], { sdk: 32 })
	const [video] = await scanAndroidVideos()
	assert.equal(video.name, '视频 7')
	assert.equal(video.folder, 'Movies/Clips/')
	assert.equal(video.filePath, '')
	assert.equal(video.duration, 0)
	assert.deepEqual(native.permissions, ['android.permission.READ_EXTERNAL_STORAGE'])
	assert.equal(native.closed, 1)
})

test('skips zero-sized rows while completing progress', async (t) => {
	const native = androidFixture(t, [{ _id: 1, _size: 100 }, { _id: 2, _size: 0 }])
	const progress = []
	const videos = await scanAndroidVideos((...value) => progress.push(value))
	assert.equal(videos.length, 1)
	assert.deepEqual(progress, [[100, 2, 2]])
	assert.equal(native.closed, 1)
})

test('requests legacy storage permission for an old HBuilder base on a recent Android device', async (t) => {
	const native = androidFixture(t, [], { sdk: 36, targetSdk: 28 })
	await scanAndroidVideos()
	assert.deepEqual(native.permissions, ['android.permission.READ_EXTERNAL_STORAGE'])
})

test('recognizes Android permission result 0 as granted', async (t) => {
	const native = androidFixture(t, [], { granted: true })
	await scanAndroidVideos()
	assert.deepEqual(native.permissions, [])
	assert.equal(native.queried, 1)
})

test('closes an empty cursor', async (t) => {
	const native = androidFixture(t)
	assert.deepEqual(await scanAndroidVideos(), [])
	assert.equal(native.closed, 1)
})

test('handles a null cursor', async (t) => {
	const native = androidFixture(t, [], { nullCursor: true })
	assert.deepEqual(await scanAndroidVideos(), [])
	assert.equal(native.closed, 0)
})

test('closes the cursor after an iteration failure', async (t) => {
	const native = androidFixture(t, [{ _id: 1, _size: 100 }], { iterationError: true })
	await assert.rejects(scanAndroidVideos(), { code: 'SCAN_FAILED', message: 'Cursor disconnected' })
	assert.equal(native.closed, 1)
})

test('reports native query errors', async (t) => {
	androidFixture(t, [], { queryError: true })
	await assert.rejects(scanAndroidVideos(), { code: 'SCAN_FAILED', message: 'MediaStore unavailable' })
})

test('does not query video data when permission is denied', async (t) => {
	const native = androidFixture(t, [], { denied: true })
	await assert.rejects(scanAndroidVideos(), { code: 'PERMISSION_DENIED_ALWAYS' })
	assert.equal(native.queried, 0)
})
