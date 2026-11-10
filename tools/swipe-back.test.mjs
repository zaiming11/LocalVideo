import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSwipeBack } from '../core/swipe-back.mjs'

const touch = (x, y = 100) => ({ clientX: x, clientY: y })
const start = (x = 280, y = 100, target = {}) => ({ touches: [touch(x, y)], target })
const end = (x = 100, y = 100) => ({ touches: [], changedTouches: [touch(x, y)] })
test('left swipes go back exactly once; root pages and changing navigation state are guarded', () => {
  let allowed = true, calls = 0
  const swipe = createSwipeBack({ canGoBack: () => allowed, onBack: () => calls++ })
  swipe.start(start()); assert.equal(swipe.end(end()), true); swipe.end(end())
  assert.equal(calls, 1)
  allowed = false; swipe.start(start()); swipe.end(end()); assert.equal(calls, 1)
  allowed = true; swipe.start(start()); allowed = false; swipe.end(end()); assert.equal(calls, 1)
})
test('vertical scrolling, right swipes, taps, long gestures and cancellations never navigate', () => {
  let calls = 0, time = 0
  const swipe = createSwipeBack({ onBack: () => calls++, now: () => time })
  swipe.start(start()); swipe.move({ touches: [touch(270, 150)] }); swipe.end(end())
  swipe.start(start()); swipe.end(end(360))
  swipe.start(start()); swipe.end(end(250))
  swipe.start(start()); swipe.end(end(100, 240))
  swipe.start(start()); time = 1200; swipe.end(end())
  swipe.start(start()); swipe.cancel(); swipe.end(end())
  swipe.start(start()); swipe.move({ touches: [touch(270), touch(200)] }); swipe.end(end())
  assert.equal(calls, 0)
})
test('text inputs, sliders, native video and multi-touch starts are left to their own controls', () => {
  let calls = 0
  const swipe = createSwipeBack({ onBack: () => calls++ })
  for (const target of [{ closest: () => ({}) }, { id: 'app-player' }, { dataset: { noSwipeBack: true } }]) {
    swipe.start(start(280, 100, target)); swipe.end(end())
  }
  swipe.start({ touches: [touch(280), touch(250)] }); swipe.end(end())
  assert.equal(calls, 0)
})
