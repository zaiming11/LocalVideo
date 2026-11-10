import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sourceIdentity, rememberedOption, readSelections } from '../core/tvbox/selection.mjs'

test('site and live selections survive reordered options and fall back only when removed', () => {
  const a = { identity: sourceIdentity({ key: 'a' }), name: 'A' }
  const b = { identity: sourceIdentity({ key: 'b' }), name: 'B' }
  const live = { identity: sourceIdentity({ url: 'https://example.com/live.m3u' }, true), name: 'Live' }
  const remembered = b.identity
  assert.equal(rememberedOption([a, b, live], remembered), b)
  assert.equal(rememberedOption([live, b, a], remembered), b)
  assert.equal(rememberedOption([a, live], remembered), a)
  assert.equal(rememberedOption([a, live], live.identity), live)
  assert.equal(rememberedOption([], remembered), null)
  assert.notEqual(sourceIdentity({ key: 'same' }), sourceIdentity({ name: 'same' }, true))
})
test('selection records isolate configuration scopes and ignore malformed saved values', () => {
  const saved = readSelections({ warehouses: { root: 'warehouse-b', invalid: null }, sources: { 'warehouse-a': 'site-a', 'warehouse-b': 'live-b', invalid: {} } })
  assert.deepEqual(saved, { warehouses: { root: 'warehouse-b' }, sources: { 'warehouse-a': 'site-a', 'warehouse-b': 'live-b' } })
  assert.deepEqual(readSelections(null), { warehouses: {}, sources: {} })
})
