import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickAndroidDirectory, readAndroidDirectory } from '../core/android-directory.js'

const DIRECTORY_MIME = 'vnd.android.document/directory'
const selection = { uri: 'content://documents/tree/root' }

function directoryFixture(t, options = {}) {
	const previousPlus = globalThis.plus
	t.after(() => { globalThis.plus = previousPlus })
	const state = { queries: 0, closed: 0, released: 0, grants: [], previousResults: [], request: null }
	const previousResult = (...args) => state.previousResults.push(args)
	const activity = { kind: 'activity', onActivityResult: previousResult }
	const resolver = { kind: 'resolver' }
	const root = { document_id: 'root', _display_name: 'Films', mime_type: DIRECTORY_MIME }
	const files = {
		movie: { document_id: 'movie', _display_name: 'Movie 10.mkv', mime_type: 'application/octet-stream', _size: 200, last_modified: 1700000000000 },
		episode: { document_id: 'episode', _display_name: 'Episode 2.mp4', mime_type: 'video/mp4', _size: 300 },
		custom: { document_id: 'custom', _display_name: 'Clip.custom', mime_type: 'video/custom', _size: 400 }
	}
	const children = options.children || {
		root: [files.movie, { document_id: 'season', _display_name: 'Season 1', mime_type: DIRECTORY_MIME }, { document_id: 'text', _display_name: 'notes.txt', mime_type: 'text/plain' }],
		season: [files.episode, files.custom, root]
	}
	const documentUri = (id) => ({ kind: 'documentUri', id, uri: `content://documents/tree/root/document/${id}` })
	globalThis.plus = {
		android: {
			runtimeMainActivity: () => activity,
			importClass(name) {
				if (name === 'android.net.Uri') return { parse: (uri) => ({ kind: 'treeUri', uri }) }
				if (name === 'android.provider.DocumentsContract') return {
					getTreeDocumentId: () => 'root',
					buildDocumentUriUsingTree: (_, id) => documentUri(id),
					buildChildDocumentsUriUsingTree: (_, id) => ({ kind: 'childrenUri', id })
				}
				if (name === 'android.content.Intent') return function Intent(action) { this.kind = 'intent'; this.action = action }
				if (name === 'android.media.MediaMetadataRetriever') return function Retriever() { this.kind = 'retriever' }
				throw new Error(`Unexpected class: ${name}`)
			},
			invoke(handle, method, ...args) {
				if (handle === activity && method === 'getContentResolver') return resolver
				if (handle === activity && method === 'startActivityForResult') {
					if (options.launchError) throw new Error('No directory picker')
					state.request = { intent: args[0], code: args[1] }
					return
				}
				if (handle.kind === 'intent' && method === 'addFlags') { handle.flags = args[0]; return }
				if (handle.kind === 'result' && method === 'getData') return { kind: 'treeUri', uri: selection.uri }
				if (handle.kind === 'result' && method === 'getFlags') return 1 | 64 | 128
				if (method === 'toString' && handle.uri) return handle.uri
				if (handle === resolver && method === 'takePersistableUriPermission') {
					if (options.grantError) throw new Error('Grant rejected')
					state.grants.push(args)
					return
				}
				if (handle === resolver && method === 'query') {
					state.queries++
					const uri = args[0]
					if (options.queryError && uri.kind === 'childrenUri') throw new Error('Directory unreadable')
					const rows = uri.kind === 'childrenUri' ? children[uri.id] || [] : [root]
					return { kind: 'cursor', rows, row: -1, columns: [...new Set(rows.flatMap(Object.keys))] }
				}
				if (handle.kind === 'cursor') {
					if (method === 'moveToNext') return ++handle.row < handle.rows.length
					if (method === 'getColumnIndex') return handle.columns.indexOf(args[0])
					if (method === 'getString') return handle.rows[handle.row][handle.columns[args[0]]] ?? null
					if (method === 'getLong') return handle.rows[handle.row][handle.columns[args[0]]] ?? 0
					if (method === 'close') { state.closed++; return }
				}
				if (handle.kind === 'retriever') {
					if (method === 'setDataSource') {
						if (args[1].id === 'movie') throw new Error('Unsupported metadata')
						return
					}
					if (method === 'extractMetadata') return { 9: '61500', 18: '1920', 19: '1080' }[args[0]]
					if (method === 'release') { state.released++; return }
				}
				if (handle === 'android.provider.MediaStore' && method === 'getMediaUri') {
					if (options.oldAndroid) throw new Error('Method unavailable')
					return args[1].id === 'episode' ? { uri: 'content://media/external/file/42' } : null
				}
				throw new Error(`Unexpected native call: ${method}`)
			}
		}
	}
	state.activity = activity
	state.previousResult = previousResult
	state.finishPicker = (resultCode = -1) => activity.onActivityResult(state.request.code, resultCode, { kind: 'result' })
	return state
}

test('directory picker requests persistent read access and restores the previous result handler', async (t) => {
	const native = directoryFixture(t)
	const picked = pickAndroidDirectory()
	assert.equal(native.request.intent.action, 'android.intent.action.OPEN_DOCUMENT_TREE')
	assert.equal(native.request.intent.flags & 2, 0, 'write access is not requested')
	assert.equal(native.request.intent.flags & 64, 64)
	native.finishPicker()
	assert.deepEqual(await picked, selection)
	assert.equal(native.grants.length, 1)
	assert.equal(native.grants[0][1], 1)
	assert.equal(native.activity.onActivityResult, native.previousResult)
})

test('cancelling the picker does not import or retain access', async (t) => {
	const native = directoryFixture(t)
	const picked = pickAndroidDirectory()
	native.finishPicker(0)
	assert.equal(await picked, null)
	assert.equal(native.grants.length, 0)
	assert.equal(native.activity.onActivityResult, native.previousResult)
})

test('unrelated activity results are forwarded and concurrent pickers are rejected', async (t) => {
	const native = directoryFixture(t)
	const picked = pickAndroidDirectory()
	await assert.rejects(pickAndroidDirectory(), { code: 'PICKER_BUSY' })
	native.activity.onActivityResult(123, 0, null)
	assert.deepEqual(native.previousResults, [[123, 0, null]])
	native.finishPicker(0)
	await picked
})

test('a picker launch failure restores the handler and permits a retry', async (t) => {
	const native = directoryFixture(t, { launchError: true })
	await assert.rejects(pickAndroidDirectory(), { code: 'DIRECTORY_PICKER_FAILED' })
	assert.equal(native.activity.onActivityResult, native.previousResult)
	await assert.rejects(pickAndroidDirectory(), { code: 'DIRECTORY_PICKER_FAILED' })
})

test('a failed persistent grant is reported instead of saving temporary access', async (t) => {
	const native = directoryFixture(t, { grantError: true })
	const picked = pickAndroidDirectory()
	native.finishPicker()
	await assert.rejects(picked, { code: 'DIRECTORY_PERMISSION' })
	assert.equal(native.activity.onActivityResult, native.previousResult)
})

test('imports nested videos, skips non-video files and avoids directory cycles', async (t) => {
	const native = directoryFixture(t)
	const progress = []
	const videos = await readAndroidDirectory(selection, (...value) => progress.push(value))
	assert.equal(videos.length, 3)
	const movie = videos.find((video) => video.name === 'Movie 10.mkv')
	const episode = videos.find((video) => video.name === 'Episode 2.mp4')
	assert.equal(movie.folder, 'Films')
	assert.equal(movie.duration, 0, 'a metadata failure still allows import')
	assert.equal(movie.size, 200)
	assert.equal(movie.modified, 1700000000000)
	assert.equal(movie.ext, 'mkv')
	assert.equal(episode.folder, 'Films/Season 1')
	assert.equal(episode.duration, 62)
	assert.equal(episode.width, 1920)
	assert.equal(episode.height, 1080)
	assert.equal(episode.id, 'android_42', 'the same MediaStore video retains its existing ID')
	assert.match(episode.contentUri, /^content:\/\/documents\/tree\/root\/document\//)
	assert.equal(episode.url, episode.contentUri)
	assert.deepEqual(progress.at(-1), [100, 3, 3])
	assert.equal(native.queries, 3, 'the cyclic root is not queried twice')
	assert.equal(native.closed, 3)
	assert.equal(native.released, 1)
})

test('document IDs remain stable across repeated imports on older Android versions', async (t) => {
	const native = directoryFixture(t, { oldAndroid: true })
	const first = await readAndroidDirectory(selection)
	const second = await readAndroidDirectory(selection)
	assert.deepEqual(first.map((video) => video.id), second.map((video) => video.id))
	assert(first.every((video) => video.id.startsWith('android_document_')))
	assert.equal(native.closed, native.queries)
	assert.equal(native.released, 2)
})

test('empty folders finish without adding videos', async (t) => {
	const native = directoryFixture(t, { children: { root: [] } })
	assert.deepEqual(await readAndroidDirectory(selection), [])
	assert.equal(native.closed, native.queries)
})

test('query failures close previously opened cursors', async (t) => {
	const native = directoryFixture(t, { queryError: true })
	await assert.rejects(readAndroidDirectory(selection), { code: 'DIRECTORY_READ_FAILED' })
	assert.equal(native.closed, 1)
})

test('releases the metadata reader when processing is interrupted', async (t) => {
	const native = directoryFixture(t)
	await assert.rejects(readAndroidDirectory(selection, (_, __, total) => {
		if (total > 0) throw new Error('Interrupted')
	}), { code: 'DIRECTORY_READ_FAILED' })
	assert.equal(native.released, 1)
	assert.equal(native.closed, native.queries)
})

test('rejects an invalid directory URI', async () => {
	await assert.rejects(readAndroidDirectory({ uri: 'file:///sdcard' }), { code: 'INVALID_DIRECTORY' })
})
