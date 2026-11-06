import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { compareFileNames } from '../core/natural-sort.js'

test('filenames sort as 1, 2, 9, 10, 11, 100 in either direction', () => {
	const names = ['10.mp4', '100.mp4', '2.mp4', '11.mp4', '1.mp4', '9.mp4']
	const expected = ['1.mp4', '2.mp4', '9.mp4', '10.mp4', '11.mp4', '100.mp4']
	assert.deepEqual([...names].sort(compareFileNames), expected)
	assert.deepEqual([...names].sort((a, b) => -compareFileNames(a, b)), [...expected].reverse())
})

test('season and episode numbers compare independently, including zero padding', () => {
	const names = ['第10季 第1集.mp4', '第1季 第10集.mp4', '第01季 第02集.mp4', '第1季 第1集.mp4', '第2季 第1集.mp4']
	assert.deepEqual(names.sort(compareFileNames), ['第1季 第1集.mp4', '第01季 第02集.mp4', '第1季 第10集.mp4', '第2季 第1集.mp4', '第10季 第1集.mp4'])
	assert.deepEqual(['001.mp4', '10.mp4', '01.mp4', '1.mp4'].sort(compareFileNames), ['1.mp4', '01.mp4', '001.mp4', '10.mp4'])
})

test('numeric ordering does not depend on locale numeric options or floating point precision', (t) => {
	const source = readFileSync(new URL('../core/natural-sort.js', import.meta.url), 'utf8').replace('export function', 'function')
	const legacyCompare = new Function('Intl', `${source}\nreturn compareFileNames`)(undefined)
	t.mock.method(String.prototype, 'localeCompare', function (other) { return this < other ? -1 : this > other ? 1 : 0 })
	assert(legacyCompare('第1集.mp4', '第10集.mp4') < 0)
	assert(legacyCompare('Episode 2.mp4', 'Episode 10.mp4') < 0)
	assert(compareFileNames('9007199254740992.mp4', '9007199254740993.mp4') < 0)
	assert.equal(compareFileNames('', ''), 0)
})
