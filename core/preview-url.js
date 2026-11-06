// Also migrate the old preview addresses saved in browser storage.
export function normalizePreviewUrls(video) {
	if (!video.preview) return video
	const migrate = (url) => typeof url === 'string'
		? url.replace(/^http:\/\/(?:127\.0\.0\.1|localhost):8098\/(video|thumbs)\//, '/__preview_media/$1/')
		: url
	return { ...video, url: migrate(video.url), thumb: migrate(video.thumb), poster: migrate(video.poster) }
}
