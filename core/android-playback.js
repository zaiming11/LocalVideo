const strategyCache = new Map()

export function getAndroidPlayStrategy(video) {
	const url = String(video?.url || '')
	if (typeof plus === 'undefined' || !plus.android || !/^(content:|file:|\/)/i.test(url)) return 0
	const key = `${url}|${video.size || 0}|${video.modified || 0}`
	if (strategyCache.has(key)) return strategyCache.get(key)
	let extractor = null
	try {
		extractor = plus.android.newObject('android.media.MediaExtractor')
		const uri = plus.android.invoke('android.net.Uri', 'parse', url)
		plus.android.invoke(extractor, 'setDataSource', plus.android.runtimeMainActivity(), uri, null)
		const count = Number(plus.android.invoke(extractor, 'getTrackCount')) || 0
		let strategy = 0
		for (let index = 0; index < count; index++) {
			const format = plus.android.invoke(extractor, 'getTrackFormat', index)
			const mime = String(plus.android.invoke(format, 'getString', 'mime') || '').toLowerCase()
			if (!mime.startsWith('video/')) continue
			// HBuilder 的普通 IJK 策略只启用 AVC 硬解；策略 1 同时启用 HEVC。
			// 只对 HEVC 使用该策略，其他本地视频保持普通模式。
			strategy = mime === 'video/hevc' ? 1 : 0
			break
		}
		if (strategyCache.size >= 64) strategyCache.delete(strategyCache.keys().next().value)
		strategyCache.set(key, strategy)
		return strategy
	} catch (error) {
		return 0
	} finally {
		if (extractor) {
			try { plus.android.invoke(extractor, 'release') } catch (error) { /* already released */ }
		}
	}
}
