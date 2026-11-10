<template><view class="vlc-placeholder" /></template>
<script setup>
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { createAndroidVlc } from '../core/libvlc-android.js'
const props = defineProps({ src: String, fullscreen: Boolean, fill: Boolean, controls: Boolean, locked: Boolean, live: Boolean, revision: Number, visible: { type: Boolean, default: true } })
const emit = defineEmits(['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended', 'error'])
const instance = getCurrentInstance()
let player, disposed = false, activeSource = '', layoutTimer
function fail(error) { emit('error', { detail: { errMsg: String(error.message || error) } }) }
function ensure() {
  if (!player && !disposed) player = createAndroidVlc((type, detail) => {
    if (type === 'ready' || type === 'loadedmetadata') nextTick(layout)
    if (type !== 'ready') emit(type, { detail })
  })
  return player
}
function layout() {
  if (!player || disposed) return
  uni.createSelectorQuery().in(instance.proxy).select('.vlc-placeholder').boundingClientRect(rect => {
    if (!rect || !player || disposed) return
    player.layout({ ...rect, fullscreen: props.fullscreen, fill: props.fill, viewportWidth: uni.getSystemInfoSync().windowWidth })
    player.controls(props.controls, props.locked, props.live)
    player.visible(props.visible && !!props.src)
  }).exec()
}
function source() {
  if (!props.src || disposed) { activeSource = ''; player?.suspend(); player?.visible(false); return }
  try {
    if (activeSource === props.src) return
    ensure().open(props.src); activeSource = props.src; nextTick(layout)
  } catch (error) { fail(error) }
}
onMounted(() => { source(); uni.onWindowResize(layout) })
watch(() => props.src, source)
watch(() => [props.fullscreen, props.fill, props.revision], () => { nextTick(layout); clearTimeout(layoutTimer); layoutTimer = setTimeout(layout, 400) })
watch(() => [props.controls, props.locked, props.live], () => player?.controls(props.controls, props.locked, props.live))
watch(() => props.visible, value => player?.visible(value && !!props.src))
function release() { if (disposed) return; disposed = true; clearTimeout(layoutTimer); uni.offWindowResize(layout); player?.release(); player = null }
onBeforeUnmount(release)
defineExpose({
  play() { try { source(); player?.play() } catch (error) { fail(error) } },
  pause() { player?.pause() }, seek(value) { player?.seek(value) }, playbackRate(value) { player?.playbackRate(value) },
  retry() { activeSource = ''; source() }, visible(value) { player?.visible(value) }, refreshLayout: layout, release
})
</script>
<style scoped>.vlc-placeholder { width: 100%; height: 100%; background: #000; }</style>
