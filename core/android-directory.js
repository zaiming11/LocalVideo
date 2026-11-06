import { getExtension, isVideoFile, makeVideoId, paletteFor, titleFromFilename } from './utils.js'

const DIRECTORY_REQUEST_CODE = 12732
const READ_PERMISSION = 1
const DIRECTORY_MIME = 'vnd.android.document/directory'
let directoryPickerPending = false

function directoryError(code, message) {
	const error = new Error(message)
	error.code = code
	return error
}

export function pickAndroidDirectory() {
	// #ifdef APP-PLUS
	if (directoryPickerPending) return Promise.reject(directoryError('PICKER_BUSY', '文件夹选择器已打开'))
	return new Promise((resolve, reject) => {
		const main = plus.android.runtimeMainActivity()
		const previousResult = main.onActivityResult
		const restore = () => {
			if (main.onActivityResult === onResult) main.onActivityResult = previousResult
			directoryPickerPending = false
		}
		const onResult = (requestCode, resultCode, data) => {
			if (Number(requestCode) !== DIRECTORY_REQUEST_CODE) {
				if (typeof previousResult === 'function') previousResult.call(main, requestCode, resultCode, data)
				return
			}
			restore()
			if (Number(resultCode) !== -1 || !data) {
				resolve(null)
				return
			}
			try {
				const treeUri = plus.android.invoke(data, 'getData')
				if (!treeUri) throw new Error('没有获取到文件夹')
				const flags = Number(plus.android.invoke(data, 'getFlags')) & READ_PERMISSION
				if (!flags) throw new Error('没有获得文件夹读取权限')
				const resolver = plus.android.invoke(main, 'getContentResolver')
				plus.android.invoke(resolver, 'takePersistableUriPermission', treeUri, flags)
				resolve({ uri: String(plus.android.invoke(treeUri, 'toString')) })
			} catch (error) {
				reject(directoryError('DIRECTORY_PERMISSION', error?.message || '无法读取所选文件夹，请重新选择'))
			}
		}
		try {
			directoryPickerPending = true
			main.onActivityResult = onResult
			const Intent = plus.android.importClass('android.content.Intent')
			const intent = new Intent('android.intent.action.OPEN_DOCUMENT_TREE')
			plus.android.invoke(intent, 'addFlags', READ_PERMISSION | 64 | 128)
			plus.android.invoke(main, 'startActivityForResult', intent, DIRECTORY_REQUEST_CODE)
		} catch (error) {
			restore()
			reject(directoryError('DIRECTORY_PICKER_FAILED', '无法打开系统文件夹选择器'))
		}
	})
	// #endif
	// #ifndef APP-PLUS
	return Promise.reject(directoryError('NOT_APP', '文件夹选择仅在 Android App 中可用'))
	// #endif
}

function queryDocuments(resolver, uri) {
	let cursor = null
	try {
		cursor = plus.android.invoke(resolver, 'query', uri, null, null, null, null)
		if (!cursor) throw new Error('无法读取文件夹内容')
		const indexes = {}
		const read = (name, numeric = false) => {
			if (indexes[name] === undefined) indexes[name] = Number(plus.android.invoke(cursor, 'getColumnIndex', name))
			if (indexes[name] < 0) return numeric ? 0 : ''
			const value = plus.android.invoke(cursor, numeric ? 'getLong' : 'getString', indexes[name])
			return numeric ? Number(value) || 0 : value == null ? '' : String(value)
		}
		const documents = []
		while (plus.android.invoke(cursor, 'moveToNext')) {
			documents.push({
				id: read('document_id'),
				name: read('_display_name'),
				mime: read('mime_type'),
				size: read('_size', true),
				modified: read('last_modified', true)
			})
		}
		return documents
	} finally {
		if (cursor) {
			try { plus.android.invoke(cursor, 'close') } catch (error) { /* cursor may already be closed */ }
		}
	}
}

function androidDocumentVideoId(main, documentUri, documentId, authority) {
	try {
		// 与媒体库扫描使用同一个 ID，避免同一视频经两种入口重复导入。
		const mediaUri = plus.android.invoke('android.provider.MediaStore', 'getMediaUri', main, documentUri)
		if (mediaUri) {
			const uri = String(plus.android.invoke(mediaUri, 'toString'))
			const match = uri.match(/\/(?:video\/media|file)\/(\d+)$/)
			if (match) return `android_${match[1]}`
		}
	} catch (error) { /* Android < 10 and some providers cannot map document URIs */ }
	return `android_document_${makeVideoId(documentId, 0, 0, authority)}`
}

export async function readAndroidDirectory(selection, onProgress) {
	// #ifdef APP-PLUS
	if (!selection?.uri?.startsWith('content://')) throw directoryError('INVALID_DIRECTORY', '请重新选择视频文件夹')
	let retriever = null
	try {
		const main = plus.android.runtimeMainActivity()
		const resolver = plus.android.invoke(main, 'getContentResolver')
		const Uri = plus.android.importClass('android.net.Uri')
		const Documents = plus.android.importClass('android.provider.DocumentsContract')
		const treeUri = Uri.parse(selection.uri)
		const rootId = String(Documents.getTreeDocumentId(treeUri))
		const rootUri = Documents.buildDocumentUriUsingTree(treeUri, rootId)
		const root = queryDocuments(resolver, rootUri)[0]
		const rootName = root?.name || '所选文件夹'
		const pending = [{ id: rootId, folder: rootName }]
		const visited = new Set()
		const files = []
		while (pending.length) {
			const directory = pending.pop()
			if (visited.has(directory.id)) continue
			visited.add(directory.id)
			const childrenUri = Documents.buildChildDocumentsUriUsingTree(treeUri, directory.id)
			for (const document of queryDocuments(resolver, childrenUri)) {
				if (!document.id) continue
				if (document.mime === DIRECTORY_MIME) {
					pending.push({ id: document.id, folder: `${directory.folder}/${document.name}` })
				} else if (isVideoFile(document.name, document.mime)) {
					files.push({ ...document, folder: directory.folder })
				}
			}
			if (onProgress) onProgress(5, files.length, 0)
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
		try {
			const Retriever = plus.android.importClass('android.media.MediaMetadataRetriever')
			retriever = new Retriever()
		} catch (error) { /* files can still be imported without metadata */ }
		const authority = selection.uri.split('/')[2]
		const videos = []
		for (const [index, file] of files.entries()) {
			const documentUri = Documents.buildDocumentUriUsingTree(treeUri, file.id)
			const contentUri = String(plus.android.invoke(documentUri, 'toString'))
			const metadata = { duration: 0, width: 0, height: 0 }
			if (retriever) {
				try {
					plus.android.invoke(retriever, 'setDataSource', main, documentUri)
					metadata.duration = Math.round((Number(plus.android.invoke(retriever, 'extractMetadata', 9)) || 0) / 1000)
					metadata.width = Number(plus.android.invoke(retriever, 'extractMetadata', 18)) || 0
					metadata.height = Number(plus.android.invoke(retriever, 'extractMetadata', 19)) || 0
				} catch (error) { /* unsupported metadata does not prevent importing a video */ }
			}
			const palette = paletteFor(file.name)
			videos.push({
				id: androidDocumentVideoId(main, documentUri, file.id, authority),
				name: file.name,
				title: titleFromFilename(file.name),
				url: contentUri,
				contentUri,
				filePath: '',
				thumb: '',
				poster: '',
				...metadata,
				size: file.size,
				modified: file.modified || Date.now(),
				addedAt: Date.now(),
				folder: file.folder,
				series: file.folder,
				ext: getExtension(file.name) || 'mp4',
				mime: file.mime.startsWith('video/') ? file.mime : 'video/*',
				episode: 0,
				description: '',
				accent: palette.accent,
				from: palette.from,
				to: palette.to,
				demo: false,
				source: 'android'
			})
			const done = index + 1
			if (onProgress) onProgress(5 + Math.round(done / files.length * 95), done, files.length)
			if (done % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
		}
		return videos
	} catch (error) {
		throw directoryError('DIRECTORY_READ_FAILED', error?.message || '读取文件夹失败，请重新选择')
	} finally {
		if (retriever) {
			try { plus.android.invoke(retriever, 'release') } catch (error) { /* noop */ }
		}
	}
	// #endif
	// #ifndef APP-PLUS
	throw directoryError('NOT_APP', '文件夹导入仅在 Android App 中可用')
	// #endif
}
