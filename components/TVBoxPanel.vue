<template>
  <view class="box-page" :class="{'settings-mode': mode === 'settings', 'subpage-mode': detail || routePage}" @touchstart="backSwipe.start" @touchmove="backSwipe.move" @touchend="backSwipe.end" @touchcancel="backSwipe.cancel">
    <template v-if="mode === 'settings'">
      <view class="connect panel">
        <text class="section-label">TVBox 配置</text>
        <TVBoxResourcePicker ref="resourcePicker" v-model="address" :display-value="localLabel" @popup-change="resourcePopupOpen = $event" />
        <view class="local-config-actions"><button :disabled="!!busy || localImportBusy || !localFolderSupported" @click="loadLocalFolder">{{ localImportBusy ? '正在读取文件夹…' : '加载本地配置文件夹' }}</button><text class="hint">{{ localFolderSupported ? '加载文件夹后，手动选择主配置即可应用；支持目录内的 JAR 和规则文件。' : '本地文件夹导入请使用 Windows 桌面版或 Android App。' }}</text></view>
        <view v-if="localFolder" class="local-config-dropdown">
          <text class="hint">本地主配置 · {{ localFolder.name }}</text>
          <button class="local-config-select" :disabled="!!busy || localImportBusy" :aria-expanded="!!pendingFolder" @click="pendingFolder = pendingFolder ? null : localFolder"><text>{{ isLocalAddress ? localEntry : '选择本地主配置' }}</text><text>⌄</text></button>
          <view v-if="pendingFolder" class="local-menu-backdrop" @click="pendingFolder = null" />
          <scroll-view v-if="pendingFolder" scroll-y class="local-config-list" :scroll-into-view="localScrollTarget">
            <button v-for="(entry, index) in pendingFolder.candidates" :id="localOptionId(index)" :key="entry.path" :class="{ 'local-selected': isLocalAddress && localEntry === entry.path }" @click="selectLocalEntry(entry.path)">{{ entry.path }}</button>
          </scroll-view>
        </view>
        <view class="input-row"><view v-if="isLocalAddress" class="local-config-label">{{ localLabel }}</view><input v-else v-model="address" aria-label="TVBox 配置地址" placeholder="输入配置、仓库或影视 API 地址" @confirm="connect()"/><button :disabled="!!busy || localImportBusy" class="primary" @click="connect()">{{ busy === 'config' ? '读取中…' : isLocalAddress ? '重新加载' : '导入配置' }}</button></view>
        <text class="hint">{{ androidPlugins ? '支持 Android CSP/JAR 插件、HTTP 接口及直播列表，插件兼容性需逐站点验证。' : '支持 XML / JSON、Type 4 HTTP 接口及直播列表。Windows 版独立运行，无需安卓环境；Android JAR / DEX 插件仅限安卓 App 使用。' }}</text>
        <text v-if="config" class="summary">{{ config.sites.length }} 个站点 · {{ config.lives.length }} 组直播 · {{ warehouses.length }} 个仓库配置</text>
        <text v-if="saved && addressIdentity(address) === addressIdentity(savedAddress)" class="saved">配置已保存在本机，返回 TVBox 即可浏览片单</text>
        <text v-else-if="address" class="hint">点击“导入配置”后应用这个地址。</text>
        <view v-if="error" class="error" role="alert">{{ error }}</view>
      </view>
    </template>
    <template v-else>
      <SubpageHeader v-if="detail || routePage" :title="detail?.name || 'TVBox'" @back="backFromHeader" />
      <view v-if="openMenu" class="menu-backdrop" @click="openMenu = ''" />
      <view v-show="!detail" class="box-toolbar">
        <view v-if="warehouses.length" class="dropdown warehouse-dropdown">
          <button class="select-button" :disabled="!warehouses.length || busy === 'config'" :aria-expanded="openMenu === 'warehouse'" @click="openMenu = openMenu === 'warehouse' ? '' : 'warehouse'"><text class="select-label">仓库 · {{ warehouseName }}</text><text>⌄</text></button>
          <scroll-view v-if="openMenu === 'warehouse'" scroll-y :scroll-into-view="warehouseScrollTarget" class="dropdown-menu">
            <button v-for="(entry, index) in warehouses" :id="warehouseOptionId(index)" :key="entry.url" :class="{selected: selectedWarehouseUrl === entry.url}" @click="selectWarehouse(entry)">{{ entry.name }}</button>
          </scroll-view>
        </view>
        <view class="dropdown site-dropdown">
          <button class="select-button" :disabled="!sourceOptions.length || busy === 'config'" :aria-expanded="openMenu === 'source'" @click="openMenu = openMenu === 'source' ? '' : 'source'"><text class="select-label">{{ selectedSourceName }}</text><text>⌄</text></button>
          <scroll-view v-if="openMenu === 'source'" scroll-y :scroll-into-view="sourceScrollTarget" class="dropdown-menu">
            <button v-for="(source, index) in sourceOptions" :id="sourceOptionId(index)" :key="source.value" :class="{selected: source.value === selectedSource}" @click="selectSource(source)"><text>{{ source.name }}</text><text class="source-kind">{{ source.kind }}</text></button>
          </scroll-view>
        </view>
      </view>
      <view v-if="!detail" class="library-heading"><view><text class="kicker">ONLINE CINEMA</text><text class="title">TVBox 片单</text></view></view>
      <view v-if="error" class="error" role="alert">{{ error }}</view>
      <view v-if="config && (site || liveMode)" class="box-layout">
      <view class="content panel">
        <view v-if="site && !site.supported && !liveMode" class="empty"><text class="empty-title">这个站点需要专用插件</text><text>{{ site.reason }}</text><text class="hint">配置已经读到，但此站点不能直接用于本版。请选择 XML、JSON、Type 4 HTTP 接口或直播列表。</text></view>
        <template v-else-if="detail">
          <view class="detail-head"><image v-if="detail.pic" :src="artwork(detail.pic, detail.picHeaders)" mode="aspectFill"/><view><text class="detail-title">{{ detail.name }}</text><text class="hint">{{ detail.remarks }}</text><text class="description">{{ detail.description || '暂无简介' }}</text></view></view>
          <view class="chips"><button v-for="(group, index) in groups" :key="index" :class="{ active: groupIndex === index }" @click="groupIndex = index">{{ group.name }}</button></view>
          <text v-if="!groups.length" class="hint">此详情没有返回可用的播放列表。</text>
          <view class="episodes"><button v-for="(episode, index) in groups[groupIndex]?.episodes || []" :key="index" :disabled="!!busy" @click="playEpisode(index)">{{ episode.name }}</button></view>
        </template>
        <template v-else>
          <view class="section-head"><text class="section-label">{{ liveMode ? '直播频道' : site?.name || '请选择一个站点' }}</text><text v-if="busy" class="hint">{{ busy === 'play' ? '解析播放地址…' : '正在加载…' }}</text></view>
          <view v-if="site && !liveMode" class="input-row search"><input v-model="keyword" aria-label="搜索影片" placeholder="搜索这个站点的影片" @confirm="search"/><button :disabled="!!busy || !site.searchable" @click="search">搜索</button></view>
          <view class="chips"><button v-for="category in categories" :key="category.id" :class="{ active: categoryId === category.id }" :disabled="!!busy" @click="chooseCategory(category.id)">{{ category.name }}</button></view>
          <view v-if="!items.length && !busy" class="empty">{{ site || liveMode ? '暂无内容，请选择分类或尝试搜索。' : '导入后选择右上角站点开始浏览。' }}</view>
          <view class="cards"><button v-for="(item, index) in items" :key="item.id" class="card" :disabled="!!busy" @click="liveMode ? playChannel(index) : openDetail(item)"><image v-if="item.pic" :src="artwork(item.pic, item.picHeaders)" mode="aspectFill"/><view v-else class="poster-empty">{{ liveMode ? 'LIVE' : 'CINEMA' }}</view><text class="card-name">{{ item.name }}</text><text class="hint">{{ item.remarks }}</text></button></view>
          <view v-if="!liveMode && (page > 1 || items.length)" class="paging"><button :disabled="!!busy || page <= 1" @click="loadPage(page - 1)">上一页</button><text>{{ page }} / {{ pages }}</text><button :disabled="!!busy || page >= pages" @click="loadPage(page + 1)">下一页</button></view>
        </template>
      </view>
    </view>
    <view v-else class="welcome"><text class="empty-title">{{ warehouses.length ? '选择仓库，开始浏览' : '把喜欢的片单放在首页' }}</text><text>{{ warehouses.length ? '点击左上角选择仓库配置，再从右上角切换站点或直播。' : '在设置中导入 TVBox 配置，即可在这里浏览、搜索和播放。' }}</text><button class="primary" @click="$emit('settings')">前往设置</button></view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, getCurrentInstance } from 'vue'
import TVBoxResourcePicker from './TVBoxResourcePicker.vue'
import SubpageHeader from './SubpageHeader.vue'
import { createSwipeBack } from '../core/swipe-back.mjs'
import { sourceIdentity, rememberedOption, readSelections } from '../core/tvbox/selection.mjs'
import { canImportTVBoxFolder, pickTVBoxFolder, restoreTVBoxFolder } from '../core/tvbox/local-files.js'
import { localEntryUrl, localIdentity, localDescriptor } from '../core/tvbox/local-reference.mjs'
import { parseConfig, normalizeResponse, episodeGroups, parseLive, httpUrl, localOrigin } from '../core/tvbox/engine.mjs'
import { requestTVBox, requestTVBoxSite, tvboxMediaUrl, resolveTVBoxVideo, hasAndroidEngine } from '../core/tvbox/client.js'
import { setOnlineQueue } from '../core/store.js'

const props = defineProps({ mode: { type: String, default: 'library' }, routePage: Boolean })
const emit = defineEmits(['settings', 'popup-change', 'back'])
const warehouses = ref([]), openMenu = ref('')
const resourceUrl = ref(''), selectedWarehouseUrl = ref('')
const warehouseName = computed(() => warehouses.value.find(entry => entry.url === selectedWarehouseUrl.value)?.name || (warehouses.value.length ? '选择配置' : '当前配置'))
const selectedSource = computed(() => liveMode.value ? 'live:' + liveIndex.value : 'site:' + siteIndex.value)
const sourceOptions = computed(() => [...(config.value?.sites || []).map((source, index) => ({ value: 'site:' + index, identity: sourceIdentity(source), index, name: source.name, kind: source.native ? 'Android 插件' : source.supported ? (source.type === 0 ? 'XML' : source.type === 4 ? 'Type 4' : 'JSON') : '插件不兼容' })), ...(config.value?.lives || []).map((live, index) => ({ value: 'live:' + index, identity: sourceIdentity({ ...live, url: addressIdentity(live.url) }, true), index, live: true, name: live.name, kind: '直播' }))])
const selectedSourceName = computed(() => sourceOptions.value.find(source => source.value === selectedSource.value)?.name || '站点 / 直播')
const address = ref(''), config = ref(null), siteIndex = ref(-1), liveIndex = ref(-1), liveMode = ref(false)
const savedAddress = ref('')
const localFolder = ref(null), localEntry = ref(''), pendingFolder = ref(null), localImportBusy = ref(false)
const localScrollTarget = ref('')
const resourcePicker = ref(null), resourcePopupOpen = ref(false)
watch([resourcePopupOpen, pendingFolder], () => emit('popup-change', resourcePopupOpen.value || !!pendingFolder.value))
const localFolderSupported = canImportTVBoxFolder()
const localUrl = computed(() => localFolder.value && localEntry.value ? localEntryUrl(localFolder.value, localEntry.value) : '')
const isLocalAddress = computed(() => !!localUrl.value && address.value === localUrl.value)
const localLabel = computed(() => isLocalAddress.value ? `${localFolder.value.name} / ${localEntry.value}` : '')
const busy = ref(''), error = ref(''), saved = ref(false), keyword = ref(''), categoryId = ref('')
const categories = ref([]), items = ref([]), page = ref(1), pages = ref(1), detail = ref(null), groupIndex = ref(0)
const site = computed(() => config.value?.sites[siteIndex.value])
const groups = computed(() => detail.value ? episodeGroups(detail.value) : [])
let generation = 0, requestMode = 'home', searchWord = ''
const KEY = 'localvideo_tvbox_config_v1'
let selections = readSelections(null), alive = true, hydrated = false
const addressIdentity = value => localIdentity(localFolder.value, value)
const selectionScope = () => addressIdentity(selectedWarehouseUrl.value || resourceUrl.value || config.value?.url || '')
const saveSelections = () => { try { uni.setStorageSync(KEY + '_selection_v1', selections) } catch { /* Keep session selection if storage is full. */ } }
const uid = getCurrentInstance()?.uid || 0
const warehouseOptionId = index => `warehouse-option-${uid}-${index}`
const sourceOptionId = index => `source-option-${uid}-${index}`
const localOptionId = index => `local-config-option-${uid}-${index}`
watch(pendingFolder, async folder => {
  localScrollTarget.value = ''
  if (!folder) return
  await nextTick()
  const index = isLocalAddress.value ? folder.candidates.findIndex(entry => entry.path === localEntry.value) : -1
  if (pendingFolder.value?.id === folder.id && index >= 0) localScrollTarget.value = localOptionId(index)
})
const warehouseScrollTarget = ref(''), sourceScrollTarget = ref('')
watch(openMenu, async menu => {
  warehouseScrollTarget.value = ''; sourceScrollTarget.value = ''
  if (!menu) return
  await nextTick()
  if (openMenu.value !== menu) return
  if (menu === 'warehouse') {
    const index = warehouses.value.findIndex(entry => entry.url === selectedWarehouseUrl.value)
    if (index >= 0) warehouseScrollTarget.value = warehouseOptionId(index)
  } else {
    const index = sourceOptions.value.findIndex(source => source.value === selectedSource.value)
    if (index >= 0) sourceScrollTarget.value = sourceOptionId(index)
  }
})
function saveDraft() {
  if (hydrated && props.mode === 'settings') { try { uni.setStorageSync(KEY + '_draft', { value: addressIdentity(address.value), ...(isLocalAddress.value ? { localRoot: localDescriptor(localFolder.value, localEntry.value) } : {}) }) } catch { /* Keep draft in the current view. */ } }
}
watch(address, saveDraft)
const androidPlugins = hasAndroidEngine()
function handleBack() {
  if (pendingFolder.value) { pendingFolder.value = null; return true }
  if (resourcePicker.value?.close?.()) return true
  if (openMenu.value) { openMenu.value = ''; return true }
  if (!detail.value) return false
  generation++; busy.value = ''; error.value = ''; detail.value = null; groupIndex.value = 0
  return true
}
function backFromHeader() { if (!handleBack()) emit('back') }
const backSwipe = createSwipeBack({ canGoBack: () => props.mode !== 'settings' && !!(detail.value || props.routePage) && !openMenu.value, onBack: backFromHeader })
defineExpose({ handleBack })
onMounted(async () => {
  try {
    const stored = uni.getStorageSync(KEY)
    const draft = uni.getStorageSync(KEY + '_draft')
    selections = readSelections(uni.getStorageSync(KEY + '_selection_v1'))
    resourceUrl.value = stored?.resourceUrl || uni.getStorageSync(KEY + '_input') || stored?.url || ''
    const rememberedLocal = props.mode === 'settings' && draft && typeof draft.value === 'string' ? draft.localRoot : stored?.localRoot
    if (rememberedLocal) {
      const folder = await restoreTVBoxFolder(rememberedLocal.id)
      if (!alive) return
      if (!folder.candidates.some(entry => entry.path === rememberedLocal.entry)) throw new Error('主配置文件已移动，请重新选择本地文件夹')
      localEntry.value = rememberedLocal.entry; localFolder.value = folder
      if (props.mode !== 'settings') {
        address.value = localUrl.value
        if (await connect() && alive) {
          if (config.value.warehouses.length) {
            const remembered = selections.warehouses[resourceUrl.value]
            await selectWarehouse(warehouses.value.find(entry => addressIdentity(entry.url) === remembered) || warehouses.value[0])
          } else restoreSource()
        }
        return
      }
    }
    warehouses.value = uni.getStorageSync(KEY + '_warehouses') || []
    if (stored?.body && stored.url) {
      const cachedUrl = localFolder.value?.id === stored.localRoot?.id && stored.localPath ? localFolder.value.baseUrl + stored.localPath : stored.url
      config.value = parseConfig(stored.body, cachedUrl, { android: androidPlugins }); address.value = cachedUrl; saved.value = true
      savedAddress.value = resourceUrl.value
      if (config.value.warehouses.length) warehouses.value = config.value.warehouses
      const previousWarehouse = selections.warehouses[resourceUrl.value] || stored.warehouseUrl || stored.url
      selectedWarehouseUrl.value = warehouses.value.find(entry => addressIdentity(entry.url) === previousWarehouse)?.url || warehouses.value[0]?.url || ''
      if (props.mode !== 'settings') {
        if (config.value.warehouses.length || selectedWarehouseUrl.value && selectedWarehouseUrl.value !== (stored.warehouseUrl || stored.url)) selectWarehouse(warehouses.value.find(entry => entry.url === selectedWarehouseUrl.value))
        else restoreSource()
      }
    }
    if (props.mode === 'settings') {
      if (rememberedLocal) address.value = localUrl.value
      else if (draft && typeof draft.value === 'string') address.value = draft.value
      else if (resourceUrl.value) address.value = resourceUrl.value
      if (!localFolder.value) {
        const available = uni.getStorageSync(KEY + '_local_folder')
        if (available?.id) {
          try { const folder = await restoreTVBoxFolder(available.id); if (alive) localFolder.value = folder }
          catch (reason) { if (alive) error.value = reason.message || '本地文件夹不可用，请重新选择' }
        }
      }
    }
  } catch (reason) { error.value = reason.message || '已保存的配置无法读取，请到设置重新导入'; if (!localFolder.value) address.value = '' }
  finally { hydrated = true }
})
onBeforeUnmount(() => { alive = false; generation++; emit('popup-change', false) })
function restoreSource() {
  const selected = rememberedOption(sourceOptions.value, selections.sources[selectionScope()])
  if (selected) selectSource(selected)
}
function selectSource(source) {
  openMenu.value = ''
  selections.sources[selectionScope()] = source.identity; saveSelections()
  return source.live ? chooseLive(source.index) : chooseSite(source.index)
}
async function selectWarehouse(entry) {
  if (!entry) return
  openMenu.value = ''; address.value = entry.url
  selectedWarehouseUrl.value = entry.url
  selections.warehouses[resourceUrl.value] = addressIdentity(entry.url); saveSelections()
  config.value = null; resetResults(); siteIndex.value = -1; liveIndex.value = -1; liveMode.value = false
  if (await connect(true) && alive) restoreSource()
}
const artwork = (url, headers = {}) => tvboxMediaUrl(url, { ...site.value?.headers, ...headers }, localOrigin(config.value?.url))
async function loadLocalFolder() {
  if (localImportBusy.value || busy.value) return
  localImportBusy.value = true; error.value = ''
  try {
    const selected = await pickTVBoxFolder()
    if (!selected || !alive) return
    const folder = { ...selected, candidates: [...selected.candidates].sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true })) }
    if (!folder.candidates.length) throw new Error('文件夹中没有找到主配置')
    if (localFolder.value?.id !== folder.id) localEntry.value = ''
    localFolder.value = folder
    try { uni.setStorageSync(KEY + '_local_folder', { id: folder.id, name: folder.name }) } catch {}
    pendingFolder.value = folder
  } catch (reason) { error.value = reason.message || '本地配置文件夹读取失败' }
  finally { localImportBusy.value = false }
}
async function selectLocalEntry(path) {
  const folder = pendingFolder.value
  if (!folder?.candidates.some(entry => entry.path === path)) return
  localEntry.value = path; localFolder.value = folder; pendingFolder.value = null
  address.value = localUrl.value; saveDraft()
  await connect()
}
async function run(kind, action) {
  const ticket = ++generation; busy.value = kind; error.value = ''
  try { await action(() => ticket === generation) } catch (e) { if (ticket === generation) error.value = e.message || '请求失败' }
  finally { if (ticket === generation) busy.value = '' }
}
function resetResults() { detail.value = null; items.value = []; categories.value = []; categoryId.value = ''; page.value = 1; pages.value = 1; keyword.value = ''; requestMode = 'home' }
async function connect(fromWarehouse = false) {
  const url = httpUrl(address.value)
  if (!url) { error.value = '请输入完整的 http:// 或 https:// 配置地址'; return }
  let connected = false
  await run('config', async current => {
    const response = await requestTVBox(url)
    const next = parseConfig(response.body, response.url, { android: androidPlugins })
    if (!current()) return
    const usingLocal = localFolder.value && (fromWarehouse ? resourceUrl.value.startsWith(`local-folder:${localFolder.value.id}/`) : isLocalAddress.value)
    if (!fromWarehouse) {
      resourceUrl.value = addressIdentity(url); selectedWarehouseUrl.value = ''
    }
    config.value = next; address.value = fromWarehouse ? response.url : url; resetResults(); siteIndex.value = -1; liveMode.value = false
    try {
      uni.setStorageSync(KEY, { url: response.url, body: response.body, resourceUrl: resourceUrl.value, warehouseUrl: addressIdentity(selectedWarehouseUrl.value), ...(usingLocal ? { localRoot: localDescriptor(localFolder.value, localEntry.value), localPath: response.url.startsWith(localFolder.value.baseUrl) ? response.url.slice(localFolder.value.baseUrl.length) : '' } : {}) })
      if (!fromWarehouse) uni.setStorageSync(KEY + '_input', resourceUrl.value)
      if (!fromWarehouse || next.warehouses.length) warehouses.value = next.warehouses
      uni.setStorageSync(KEY + '_warehouses', warehouses.value)
      saved.value = true
      savedAddress.value = resourceUrl.value
    } catch { saved.value = false }
    connected = true
    if (next.sites.length && !next.sites.some(s => s.supported)) error.value = '已读取配置，但所有站点都需要本版未支持的插件。可查看站点说明，或导入 PC 兼容的 HTTP 接口源。'
  })
  return connected
}
async function chooseSite(index) {
  generation++; liveMode.value = false; siteIndex.value = index; resetResults(); error.value = ''; busy.value = ''
  if (!site.value?.supported) return
  await loadPage(1)
}
async function loadPage(target) {
  const selected = site.value
  if (!selected?.supported) return
  await run('list', async current => {
    const response = await requestTVBoxSite(selected, requestMode, { id: categoryId.value, keyword: searchWord, page: target }, config.value.url)
    const result = normalizeResponse(response.body, response.url)
    if (!current()) return
    items.value = result.items; page.value = target; pages.value = Math.max(target, result.pages)
    if (result.categories.length) categories.value = result.categories
  })
}
async function chooseCategory(id) { categoryId.value = id; requestMode = 'category'; keyword.value = ''; await loadPage(1) }
async function search() { if (!keyword.value.trim()) return; searchWord = keyword.value.trim(); categoryId.value = ''; requestMode = 'search'; await loadPage(1) }
async function openDetail(item) {
  await run('detail', async current => {
    const response = await requestTVBoxSite(site.value, 'detail', { id: item.id }, config.value.url)
    const result = normalizeResponse(response.body, response.url)
    if (!result.items.length) throw new Error('该影片没有返回详情')
    if (current()) { detail.value = result.items[0]; groupIndex.value = 0 }
  })
}
function stableId(text) { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return 'tvbox_' + (hash >>> 0).toString(16) }
function makeQueue(episodes, movie, flag, selected = site.value) {
  return episodes.map((episode, index) => ({
    id: stableId([addressIdentity(config.value.url), selected?.key || 'live', movie.id, flag, index, episode.name].join('|')),
    title: movie.name + ' · ' + episode.name, name: movie.name + ' ' + episode.name, url: episode.url,
    thumb: movie.pic ? artwork(movie.pic, movie.picHeaders) : '', folder: selected?.name || 'TVBox 直播', ext: /\.m3u8/i.test(episode.url) ? 'm3u8' : 'mp4', source: 'tvbox',
    online: { url: episode.url, flag, site: selected ? JSON.parse(JSON.stringify(selected)) : null, config: { url: config.value.url, flags: config.value.flags, parses: config.value.parses }, ...(localFolder.value ? { localRoot: { ...localDescriptor(localFolder.value, localEntry.value), baseUrl: localFolder.value.baseUrl } } : {}) }
  }))
}
async function launchQueue(queue, index) {
  await run('play', async current => {
    // Resolve once before navigation so an unsupported parse route leaves the list usable.
    await resolveTVBoxVideo(queue[index])
    if (!current()) return
    setOnlineQueue(queue, queue[index].id)
    uni.navigateTo({ url: '/pages/player/player?id=' + encodeURIComponent(queue[index].id) })
  })
}
async function playEpisode(index) { const group = groups.value[groupIndex.value]; if (group) await launchQueue(makeQueue(group.episodes, detail.value, group.flag), index) }
async function chooseLive(index) {
  generation++; liveMode.value = true; liveIndex.value = index; resetResults(); error.value = ''
  const live = config.value.lives[index]
  await run('live', async current => {
    const channels = live.url ? parseLive((await requestTVBox(live.url, live.headers, config.value.url)).body, live.url) : live.channels.flatMap(group => group.urls ? group.urls.map(url => ({ name: group.name, url: httpUrl(url, config.value.url), group: live.name })) : [])
    if (!channels.length) throw new Error('直播列表没有返回 HTTP 频道，或需要 Android 插件本机代理')
    if (current()) items.value = channels.filter(c => c.url).map((c, i) => ({ ...c, id: String(i), remarks: c.group }))
  })
}
async function playChannel(index) {
  const channel = items.value[index]
  await launchQueue(makeQueue([{ name: '直播', url: channel.url }], { id: channel.id, name: channel.name }, '', null), 0)
}
</script>

<style scoped>
.box-page{min-height:100vh;padding:28px 5vw 60px;background:#090d0e;color:#eaf0ec;box-sizing:border-box}.box-top{display:flex;align-items:center;gap:24px;margin-bottom:26px}.box-top>view{flex:1}.title{display:block;font-size:27px;font-weight:750;margin-top:6px}.kicker{font-size:10px;letter-spacing:3px;color:#89a49a}.tag{border:1px solid #36554a;color:#9ee8c6;border-radius:20px;padding:7px 14px;font-size:12px}.panel{background:#111a1b;border:1px solid #253334;border-radius:20px;padding:22px;margin-bottom:18px}.section-label{display:block;font-size:15px;font-weight:650;margin-bottom:14px}.input-row{display:flex;align-items:center;gap:12px}.input-row input{flex:1;min-width:0;background:#080f10;border:1px solid #344342;padding:14px;border-radius:12px;font-size:14px;height:23px;color:#f3f8f5}.box-page button{margin:0;border:1px solid #334240;background:#1a2726;color:#dbe6df;font-size:13px;border-radius:12px;line-height:1.5;padding:11px 17px;cursor:pointer}.box-page button:after{border:0}.box-page button[disabled]{opacity:.5}.box-page .primary,.chips .active{background:#dafa6b;color:#152016;border-color:#dafa6b}.box-page .quiet{background:transparent;border-color:#30413c}.hint{display:block;font-size:12px;color:#9baca5;line-height:1.7;margin-top:9px}.error{color:#ffbe9e;background:#3b2722;border:1px solid #714335;border-radius:10px;padding:12px;margin-top:14px;font-size:13px;line-height:1.6}.summary{color:#b8cdc2;font-size:12px;margin-top:14px}.saved{color:#9cddbb;margin-left:12px}.box-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px;align-items:start}.source-scroll{height:60vh}.box-page .source{display:flex;flex-direction:column;text-align:left;width:100%;margin-bottom:8px;gap:6px}.source-kind{font-size:10px;color:#9caea4}.box-page .source.selected{border-color:#c9ef71;background:#26382b}.source.incompatible{opacity:.65}.source.incompatible .source-kind{color:#e9ad80}.section-head{display:flex;justify-content:space-between;gap:12px}.search{margin-bottom:18px}.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 22px}.chips button{padding:8px 13px;font-size:12px}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px}.box-page .card{padding:0 0 12px;text-align:left;overflow:hidden;background:#152021}.card image,.poster-empty{width:100%;height:205px}.poster-empty{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#25433b,#111d29);color:#94b7a9;font-size:15px;letter-spacing:3px}.card-name{display:block;font-size:14px;padding:12px 10px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card .hint{padding:0 10px}.paging{display:flex;align-items:center;justify-content:center;gap:20px;margin-top:28px;font-size:13px;color:#a9bdb2}.empty,.welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;min-height:250px;padding:25px;text-align:center;color:#a7bdb3;line-height:1.8;font-size:14px}.empty-title{font-size:22px;color:#e1efdf}.detail-head{display:flex;gap:22px;margin:24px 0}.detail-head image{width:140px;height:200px;flex-shrink:0;border-radius:12px}.detail-title{display:block;font-size:24px}.description{display:block;font-size:13px;line-height:1.9;color:#aebeb6;margin-top:14px;max-height:180px;overflow:auto}.episodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}@media(max-width:700px){.box-page{padding:20px 15px 40px}.box-top{gap:10px}.title{font-size:20px}.tag{display:none}.panel{padding:16px}.box-layout{grid-template-columns:1fr}.source-scroll{height:200px}.input-row{gap:8px}.input-row input{font-size:12px;padding:10px}.box-page button{padding:10px 12px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-head image{width:100px;height:145px}.detail-title{font-size:19px}}
.input-row input { height: 48px; padding-top: 0; padding-bottom: 0; box-sizing: border-box; }
.box-page { padding-top: calc(28px + var(--status-bar-height, 0px)); }

.box-page{min-height:0;padding:0;background:transparent}.box-layout{display:block;margin-top:24px}.content.panel{padding:0;border:0;background:transparent}.box-toolbar{display:flex;justify-content:space-between;gap:16px;position:relative;z-index:22}.dropdown{position:relative;width:calc(50% - 8px);max-width:400px}.box-page .select-button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:14px 16px;text-align:left}.select-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dropdown-menu{position:absolute;top:calc(100% + 8px);left:0;width:100%;height:320px;max-height:55vh;background:#172322;border:1px solid #3c5149;border-radius:14px;box-shadow:0 18px 45px #0009;box-sizing:border-box}.dropdown-menu button{width:100%;display:flex;flex-direction:column;text-align:left;border:0;border-radius:0;padding:12px 15px}.dropdown-menu .selected{background:#30412b;color:#dafa6b}.menu-backdrop{position:fixed;inset:0;z-index:21}.library-heading{display:flex;align-items:center;justify-content:space-between;margin:30px 0 22px}.library-heading .title{font-size:28px}.settings-mode .panel{margin:0}.settings-mode .saved{display:block;margin:12px 0 0}.cards{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}.welcome{min-height:340px}
@media(max-width:700px){.box-toolbar{gap:10px}.dropdown{width:calc(50% - 5px)}.box-page .select-button{font-size:12px;padding:12px 10px}.dropdown-menu{width:calc(200% + 10px)}.site-dropdown .dropdown-menu{left:auto;right:0}.library-heading .title{font-size:24px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-mode .input-row{flex-wrap:wrap}.settings-mode input{flex-basis:100%;width:100%}}
.site-dropdown{margin-left:auto}
.local-config-dropdown{position:relative;margin-bottom:16px}.box-page .local-config-select{display:flex;justify-content:space-between;gap:12px;width:100%;text-align:left;margin-top:8px}.local-menu-backdrop{position:fixed;inset:0;z-index:30}.local-config-dropdown .local-config-list{position:absolute;top:100%;left:0;width:100%;z-index:31;background:#172322;border:1px solid #3c5149;border-radius:12px;box-shadow:0 18px 45px #0009;box-sizing:border-box}.local-config-dropdown .local-config-list button{border:0;border-radius:0;margin:0}.local-config-dropdown .local-selected{background:#30412b}
.subpage-mode{touch-action:pan-y}
.local-config-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:12px 0 16px}.local-config-actions .hint{margin:0}.local-config-label{flex:1;min-width:0;padding:14px;border:1px solid #344342;border-radius:12px;font-size:13px;overflow-wrap:anywhere}.local-config-list{height:340px;max-height:55vh}.local-config-list button{width:100%;text-align:left;margin:0 0 8px;white-space:normal;overflow-wrap:anywhere}.local-config-list .local-selected{border-color:#dafa6b;color:#dafa6b}
</style>
