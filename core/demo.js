import { paletteFor } from './utils.js'

/**
 * Demo titles are only used by the browser preview. They keep the preview
 * lively before the reviewer picks a real folder from the phone / computer.
 * Every demo file is a real, locally bundled 20 second H.264 MP4.
 */
export const DEMO_VIDEOS = [
	{
		id: 'demo_night_flight',
		title: '夜航',
		latin: 'NIGHT FLIGHT',
		name: '夜航.mp4',
		url: '/static/demo/videos/night-flight.mp4',
		thumb: '/static/demo/posters/night-flight.jpg',
		duration: 20,
		size: 354284,
		modified: new Date(2026, 10, 5, 22, 40).getTime(),
		folder: '示例影院',
		ext: 'mp4',
		mime: 'video/mp4',
		width: 1280,
		height: 720,
		episode: 1,
		series: '示例影院 · 深空单元',
		description: '一次没有归途的深空漂流。信号消失前，最后一段影像被保存了下来。',
		accent: '#8EF0D2',
		demo: true
	},
	{
		id: 'demo_sunset_coast',
		title: '日落海岸',
		latin: 'SUNSET COAST',
		name: '日落海岸.mp4',
		url: '/static/demo/videos/sunset-coast.mp4',
		thumb: '/static/demo/posters/sunset-coast.jpg',
		duration: 20,
		size: 325507,
		modified: new Date(2026, 10, 3, 18, 20).getTime(),
		folder: '示例影院',
		ext: 'mp4',
		mime: 'video/mp4',
		width: 1280,
		height: 720,
		episode: 2,
		series: '示例影院 · 公路单元',
		description: '沿着海岸线一直向西，在太阳沉入海面之前，把风景留在镜头里。',
		accent: '#FFC478',
		demo: true
	},
	{
		id: 'demo_neon_pulse',
		title: '霓虹脉搏',
		latin: 'NEON PULSE',
		name: '霓虹脉搏.mp4',
		url: '/static/demo/videos/neon-pulse.mp4',
		thumb: '/static/demo/posters/neon-pulse.jpg',
		duration: 20,
		size: 335291,
		modified: new Date(2026, 9, 31, 0, 10).getTime(),
		folder: '示例影院',
		ext: 'mp4',
		mime: 'video/mp4',
		width: 1280,
		height: 720,
		episode: 3,
		series: '示例影院 · 城市单元',
		description: '凌晨十二点，城市的频率开始改变。霓虹、雨声和一段无法复制的节拍。',
		accent: '#F472FF',
		demo: true
	},
	{
		id: 'demo_valley_dawn',
		title: '山谷晨光',
		latin: 'VALLEY DAWN',
		name: '山谷晨光.mp4',
		url: '/static/demo/videos/valley-dawn.mp4',
		thumb: '/static/demo/posters/valley-dawn.jpg',
		duration: 20,
		size: 327627,
		modified: new Date(2026, 9, 27, 6, 40).getTime(),
		folder: '示例影院',
		ext: 'mp4',
		mime: 'video/mp4',
		width: 1280,
		height: 720,
		episode: 4,
		series: '示例影院 · 自然单元',
		description: '在雾散之前抵达山谷，第一束光越过山脊，落在安静的湖面上。',
		accent: '#C6FF9B',
		demo: true
	}
].map((item) => {
	const palette = paletteFor(item.id)
	return {
		...item,
		poster: item.thumb,
		from: palette.from,
		to: palette.to,
		accent: item.accent || palette.accent,
		addedAt: item.modified
	}
})

export const DEMO_IDS = DEMO_VIDEOS.map((item) => item.id)
