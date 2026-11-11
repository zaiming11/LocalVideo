<template>
  <view class="resource-picker">
    <view class="resource-heading">
      <text>资源配置</text>
      <button class="verify-button" :disabled="verifying" @click="verifyAll">{{ verifying ? `验证中 ${completed}/${verificationTotal}` : '验证有效性' }}</button>
    </view>
    <view v-if="expanded" class="resource-backdrop" @click="expanded = false" />
    <view class="resource-control" :class="{ expanded }">
      <button class="resource-trigger" :aria-expanded="expanded" aria-label="选择 TVBox 资源" @click="expanded = !expanded">
        <view class="resource-current"><view class="resource-name"><text>{{ selected?.name || (displayValue ? '本地配置' : '自定义配置') }}</text><text v-if="selected" class="resource-status" :class="statusFor(selected).status">{{ statusFor(selected).label }}</text></view><text class="resource-url">{{ selected?.url || displayValue || modelValue || '选择已验证的资源，或在下方输入地址' }}</text></view>
        <text class="resource-arrow">⌄</text>
      </button>
      <view v-if="expanded" class="resource-menu">
        <view class="resource-columns"><text>资源</text><text>配置地址</text></view>
        <scroll-view scroll-y :scroll-into-view="scrollTarget" class="resource-options" :class="{ restricted: !unlocked }">
          <button v-for="(resource, index) in resources" :id="optionId(index)" :key="resource.url" class="resource-option" :class="{ selected: selected?.url === resource.url }" @click="select(resource)">
            <view class="resource-option-name"><text>{{ resource.name }}</text><text class="resource-status" :class="statusFor(resource).status">{{ statusFor(resource).label }}</text></view>
            <view class="resource-option-address"><text class="resource-url">{{ resource.url }}</text><text class="resource-detail">{{ statusFor(resource).detail }}</text><text class="resource-time">{{ checkedTime(statusFor(resource)) }}</text></view>
          </button>
        </scroll-view>
        <view class="resource-access">
          <template v-if="!unlocked">
            <button v-if="!unlockFormVisible" class="unlock-trigger" @click="unlockFormVisible = true">输入密码，显示全部资源</button>
            <template v-else>
              <view class="unlock-form"><input v-model="passwordInput" password :focus="unlockFormVisible" aria-label="资源解锁密码" placeholder="请输入密码" confirm-type="done" @confirm="unlockAll" /><button class="unlock-submit" @click="unlockAll">解锁</button></view>
              <text v-if="unlockError" class="unlock-error" role="alert">{{ unlockError }}</text>
            </template>
          </template>
          <text v-else class="unlock-status">{{ accessRemembered ? '全部资源已解锁，已在本机记住' : '本次已解锁；本机存储失败，下次需重新输入密码' }}</text>
        </view>
      </view>
    </view>
    <text class="resource-help">{{ resources.length }} 项资源，状态以最近验证为准。选择后点击“导入配置”生效；配置有效不代表所有线路都能播放。</text>
    <text v-if="selected" class="resource-result">{{ statusFor(selected).detail }} · {{ checkedTime(statusFor(selected)) }}</text>
    <text v-if="validationSummary" class="resource-result" role="status">{{ validationSummary }}</text>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick, getCurrentInstance } from 'vue'
import { TVBOX_RESOURCES } from '../core/tvbox/resources.mjs'
import { httpUrl } from '../core/tvbox/engine.mjs'
import { validateResources } from '../core/tvbox/validation.mjs'
import { requestTVBox } from '../core/tvbox/client.js'

const props = defineProps({ modelValue: { type: String, default: '' }, displayValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'popup-change'])
const ACCESS_KEY = 'localvideo_tvbox_resource_access_v2'
const unlocked = ref(false), accessRemembered = ref(false), unlockFormVisible = ref(false), passwordInput = ref(''), unlockError = ref('')
const resources = computed(() => unlocked.value ? TVBOX_RESOURCES : TVBOX_RESOURCES.filter(resource => resource.url === 'https://live.hacks.tools/tv/iptv4.txt'))
const expanded = ref(false), verifying = ref(false), completed = ref(0), results = ref({}), checking = ref({}), validationSummary = ref('')
const verificationTotal = ref(0)
const selected = computed(() => resources.value.find(resource => httpUrl(resource.url) === httpUrl(props.modelValue)))
const CACHE_KEY = 'localvideo_tvbox_resource_validation_v1'
defineExpose({ close: () => { if (!expanded.value) return false; expanded.value = false; return true } })
let generation = 0
const scrollTarget = ref(''), uid = getCurrentInstance()?.uid || 0
const optionId = index => `resource-option-${uid}-${index}`
watch([expanded, resources], async ([value]) => {
  emit('popup-change', value); scrollTarget.value = ''
  if (!value) { unlockFormVisible.value = false; passwordInput.value = ''; unlockError.value = ''; return }
  await nextTick()
  const index = resources.value.findIndex(resource => resource.url === selected.value?.url)
  if (expanded.value && index >= 0) scrollTarget.value = optionId(index)
})

onMounted(() => {
  try { unlocked.value = accessRemembered.value = uni.getStorageSync(ACCESS_KEY) === true } catch { /* Keep the restricted catalog when storage is unavailable. */ }
  try {
    const cache = uni.getStorageSync(CACHE_KEY)
    if (cache && typeof cache === 'object') results.value = cache
  } catch { /* Cached checks are optional. */ }
  if (!props.modelValue && resources.value.length) emit('update:modelValue', resources.value[0].url)
})
onBeforeUnmount(() => { generation++; emit('popup-change', false) })
function statusFor(resource) {
  if (checking.value[resource.url]) return { status: 'checking', label: '验证中', detail: '正在读取配置…' }
  const cached = results.value[resource.url]
  return cached && ['valid', 'unsupported', 'unreachable'].includes(cached.status) && cached.checkedAt >= resource.validation.checkedAt ? cached : resource.validation
}
function checkedTime(result) {
  if (!result.checkedAt) return ''
  const date = new Date(result.checkedAt)
  return `验证时间：${date.toLocaleString()}`
}
function select(resource) { emit('update:modelValue', resource.url); expanded.value = false }
function unlockAll() {
  if (passwordInput.value !== '13038206958ming') { unlockError.value = '密码不正确，请重新输入'; return }
  unlocked.value = true; passwordInput.value = ''; unlockError.value = ''; unlockFormVisible.value = false
  try { uni.setStorageSync(ACCESS_KEY, true); accessRemembered.value = true } catch { /* Unlock this session without claiming persistence succeeded. */ }
}
async function verifyAll() {
  if (verifying.value) return
  const ticket = ++generation
  const entries = [...resources.value]
  verificationTotal.value = entries.length
  verifying.value = true; completed.value = 0; validationSummary.value = ''; checking.value = {}
  let valid = 0
  try {
    await validateResources(entries, requestTVBox, {
      shouldContinue: () => ticket === generation,
      onStart: resource => { checking.value[resource.url] = true },
      onResult: (resource, result) => {
        results.value[resource.url] = result; delete checking.value[resource.url]; completed.value++
        if (result.status === 'valid') valid++
        try { uni.setStorageSync(CACHE_KEY, JSON.parse(JSON.stringify(results.value))) } catch { /* Results remain visible for this session. */ }
      }
    })
    if (ticket === generation) validationSummary.value = `验证完成：${valid} 项配置有效，${completed.value - valid} 项未通过。下拉列表状态已更新。`
  } finally { if (ticket === generation) { verifying.value = false; checking.value = {} } }
}
</script>

<style scoped>
.resource-options.restricted{height:240px;max-height:34vh}.resource-access{border-top:1px solid #30453c;padding:12px 14px;background:#192b23}.resource-picker .unlock-trigger{width:100%;padding:8px 12px;text-align:center;color:#dafa6b;background:transparent;border-color:#496043}.unlock-form{display:flex;align-items:center;gap:10px}.unlock-form input{flex:1;min-width:0;height:40px;box-sizing:border-box;padding:0 12px;border:1px solid #496154;border-radius:9px;background:#101c17;color:#eaf0ec;font-size:13px}.resource-picker .unlock-submit{flex-shrink:0;padding:9px 16px;background:#dafa6b;border-color:#dafa6b;color:#172116;font-weight:600}.unlock-error{display:block;margin-top:8px;font-size:12px;color:#ffbe9e}.unlock-status{display:block;font-size:11px;line-height:1.6;color:#b9cbc2}
.resource-picker{margin-bottom:20px;color:#eaf0ec}.resource-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;font-size:13px}.resource-picker button{margin:0;border:1px solid #3b5148;border-radius:12px;background:#192824;color:#eaf0ec;line-height:1.5;text-align:left;font-size:13px}.resource-picker button:after{border:0}.resource-picker .verify-button{padding:9px 14px;color:#dafa6b;font-size:12px}.verify-button[disabled]{opacity:.6}.resource-control{position:relative}.resource-control.expanded{z-index:32}.resource-trigger{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;padding:13px 15px}.resource-current{min-width:0;flex:1}.resource-name{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-weight:600}.resource-url{display:block;font-size:12px;line-height:1.7;overflow-wrap:anywhere;word-break:break-all;color:#c0cfc9;white-space:normal}.resource-name+.resource-url{margin-top:5px}.resource-arrow{flex-shrink:0;color:#b6c8bf}.resource-backdrop{position:fixed;inset:0;z-index:31}.resource-menu{position:absolute;left:0;right:0;top:calc(100% + 7px);background:#13211e;border:1px solid #486154;border-radius:12px;overflow:hidden;box-shadow:0 18px 45px #0009}.resource-columns,.resource-option{display:grid;grid-template-columns:120px minmax(0,1fr);gap:16px;padding:12px 15px}.resource-columns{background:#22362d;color:#dafa6b;font-size:12px;font-weight:600}.resource-options{height:360px;max-height:52vh}.resource-picker .resource-option{width:100%;border:0;border-bottom:1px solid #30453c;border-radius:0;background:transparent;box-sizing:border-box}.resource-picker .resource-option.selected{background:#2b3d2c}.resource-option-name{display:flex;flex-direction:column;align-items:flex-start;gap:8px;overflow-wrap:anywhere}.resource-option-address{min-width:0}.resource-status{display:inline-block;font-size:10px;padding:2px 6px;border-radius:5px;background:#36483f;color:#b9cdc0;font-weight:400}.resource-status.valid{color:#96e7bb;background:#214331}.resource-status.unreachable,.resource-status.unsupported{color:#ffbe9e;background:#4a3027}.resource-status.checking{color:#eee48d;background:#494429}.resource-detail,.resource-time{display:block;color:#91a99d;font-size:10px;line-height:1.6;margin-top:4px;overflow-wrap:anywhere}.resource-help,.resource-result{display:block;font-size:11px;line-height:1.7;color:#9bafa5;margin-top:8px}.resource-result{color:#b9cbc2}@media(max-width:700px){.resource-columns,.resource-option{grid-template-columns:80px minmax(0,1fr);gap:10px;padding:11px 10px}.resource-url{font-size:11px}.resource-options{height:320px}.resource-picker .verify-button{padding:8px 10px}}
</style>
