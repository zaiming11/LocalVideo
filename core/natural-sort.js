// 不依赖部分 Android 引擎会忽略的 localeCompare({ numeric: true })。
let textCollator = null
try {
	if (typeof Intl !== 'undefined' && Intl.Collator) textCollator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' })
} catch (error) { /* older runtimes use the basic text comparison below */ }

export function compareFileNames(left, right) {
	const a = String(left || '').match(/\d+|\D+/g) || []
	const b = String(right || '').match(/\d+|\D+/g) || []
	let zeroPaddingOrder = 0
	for (let index = 0; index < Math.min(a.length, b.length); index++) {
		const x = a[index]
		const y = b[index]
		if (x === y) continue
		if (/^\d/.test(x) && /^\d/.test(y)) {
			const nx = x.replace(/^0+/, '') || '0'
			const ny = y.replace(/^0+/, '') || '0'
			// 按位数和数值文本比较，超长数字也不会丢失精度。
			if (nx.length !== ny.length) return nx.length - ny.length
			if (nx !== ny) return nx < ny ? -1 : 1
			if (!zeroPaddingOrder) zeroPaddingOrder = x.length - y.length
		} else {
			const order = textCollator ? textCollator.compare(x, y) : x.toLowerCase().localeCompare(y.toLowerCase())
			if (order) return order
		}
	}
	return a.length - b.length || zeroPaddingOrder
}
