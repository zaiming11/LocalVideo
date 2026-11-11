<template>
  <view class="update-card">
    <view class="update-heading"><text>应用更新</text><text class="update-version">当前版本 {{ updateState.currentVersion }}</text></view>
    <text v-if="!updateState.supported" class="update-hint">请在 Windows 桌面版或 Android App 中使用更新功能。</text>
    <template v-else>
      <text class="update-hint">从 Netlify 或 GitHub 检查并下载更新，无需账号或密码。安装包校验后，由你确认安装。</text>
      <view class="update-source"><text>更新来源</text><picker :range="sourceLabels" :value="sourceIndex" :disabled="!!updateState.phase || saving" @change="changeSource"><text>{{ sourceLabels[sourceIndex] }} ⌄</text></picker></view>
      <text class="update-hint">{{ updateState.config.source === 'github' ? '更新仓库：zaiming11/LocalVideo' : '更新服务：localcinema-zaiming11.netlify.app' }}</text>
      <template v-if="updateState.config.source === 'github'">
        <view class="update-source"><text>更新网络</text><picker :range="networkLabels" :value="networkIndex" :disabled="!!updateState.phase || saving" @change="changeNetwork"><text>{{ networkLabels[networkIndex] }} ⌄</text></picker></view>
        <view v-if="networkMode === 'custom'" class="update-fields"><input v-model="mirrorUrl" aria-label="自定义镜像地址" placeholder="https://镜像域名/" :disabled="!!updateState.phase || saving" /><button :disabled="!!updateState.phase || saving" @click="saveNetwork">保存镜像</button></view>
        <text class="update-hint">自动模式优先使用加速镜像，失败后重试 GitHub；也可选择直连或填写自己的镜像。</text>
      </template>
      <view class="update-auto"><text>启动时检查更新</text><switch :checked="updateState.config.autoCheck" :disabled="!!updateState.phase || saving" color="#dafa6b" @change="saveAutoCheck" /></view>
      <view class="update-actions">
        <button :disabled="!!updateState.phase" @click="run(checkForUpdates)">{{ updateState.phase === 'checking' ? '正在检查…' : '检查更新' }}</button>
        <button v-if="updateState.release && !updateState.downloaded" class="update-primary" :disabled="!!updateState.phase" @click="run(downloadUpdate)">{{ updateState.phase === 'downloading' ? '下载中…' : '下载新版本' }}</button>
        <button v-if="updateState.downloaded" class="update-primary" :disabled="!!updateState.phase" @click="confirmInstall">安装更新</button>
      </view>
      <view v-if="updateState.phase === 'downloading'" class="update-progress"><view class="update-track"><view :style="{width: percent + '%'}" /></view><text>{{ percent }}% · {{ size(updateState.received) }} / {{ size(updateState.total) }}</text></view>
      <view v-if="updateState.release" class="update-release"><text>新版本 {{ updateState.release.version }} · {{ size(updateState.release.size) }}</text><text v-if="updateState.release.notes" class="update-notes">{{ updateState.release.notes }}</text></view>
      <text v-if="updateState.message" class="update-hint" role="status">{{ updateState.message }}</text>
      <text v-if="localError || updateState.error" class="update-error" role="alert">{{ localError || updateState.error }}</text>
      <text v-if="updateState.checkedAt" class="update-hint">上次检查：{{ new Date(updateState.checkedAt).toLocaleString() }}</text>
    </template>
  </view>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { updateState, loadUpdateConfig, saveUpdateConfig, checkForUpdates, downloadUpdate, installUpdate } from '../core/update/client.js'
const localError = ref(''), saving = ref(false), networkMode = ref('auto'), mirrorUrl = ref('')
const networkModes = ['auto', 'direct', 'custom'], networkLabels = ['自动加速', 'GitHub 直连', '自定义镜像']
const sources = ['netlify', 'github'], sourceLabels = ['Netlify（默认）', 'GitHub Releases']
const sourceIndex = computed(() => updateState.config.source === 'github' ? 1 : 0)
const networkIndex = computed(() => networkModes.indexOf(networkMode.value))
const percent = computed(() => updateState.total ? Math.min(100, Math.floor(updateState.received / updateState.total * 100)) : 0)
const size = value => (value / 1024 / 1024).toFixed(1) + ' MiB'
onMounted(async () => { try { await loadUpdateConfig(); networkMode.value = updateState.config.downloadMode || 'auto'; mirrorUrl.value = updateState.config.mirrorUrl || '' } catch (e) { localError.value = e.message } })
async function run(action) { localError.value = ''; try { await action() } catch (e) { localError.value = e.message } }
async function saveAutoCheck(event) { saving.value = true; try { await run(() => saveUpdateConfig({ ...updateState.config, autoCheck: event.detail.value })) } finally { saving.value = false } }
async function changeSource(event) { saving.value = true; try { await run(() => saveUpdateConfig({ ...updateState.config, source: sources[Number(event.detail.value)] })) } finally { saving.value = false } }
async function changeNetwork(event) { networkMode.value = networkModes[Number(event.detail.value)]; if (networkMode.value !== 'custom') await saveNetwork() }
async function saveNetwork() { saving.value = true; try { await run(() => saveUpdateConfig({ ...updateState.config, downloadMode: networkMode.value, mirrorUrl: mirrorUrl.value })) } finally { saving.value = false } }
function confirmInstall() { uni.showModal({ title: '安装更新', content: '安装前会保存播放记录。Windows 将关闭应用并打开安装器，Android 会打开系统安装界面。', confirmText: '安装', success: result => { if (result.confirm) run(installUpdate) } }) }
</script>
<style scoped>
.update-card{padding:20px;background:#121c18;border:1px solid #304438;border-radius:16px;color:#e6eee8}.update-heading,.update-source,.update-auto{display:flex;align-items:center;justify-content:space-between;gap:16px}.update-heading{font-size:15px;font-weight:650}.update-version{font-size:11px;color:#b5c9ba}.update-hint{display:block;font-size:12px;color:#97ac9f;line-height:1.7;margin-top:10px}.update-source{padding:13px 0;color:#dafa6b;font-size:12px;cursor:pointer}.update-fields input{background:#0a130f;border:1px solid #3c5145;border-radius:9px;box-sizing:border-box;width:100%;height:44px;padding:0 12px;color:#e9f0eb;font-size:12px}.update-label{display:block;font-size:12px;margin:10px 0 7px;color:#a9c0b1}.update-auto{padding:16px 0;font-size:12px;cursor:pointer}.enabled{color:#dafa6b}.update-card button{margin:0;padding:10px 14px;line-height:1.5;border:1px solid #43563e;border-radius:9px;background:#263526;color:#dafa6b;font-size:12px}.update-card button:after{border:0}.update-card button[disabled]{opacity:.5}.update-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.update-card .update-primary{background:#dafa6b;color:#14200e}.update-error{display:block;color:#ffb99c;font-size:12px;line-height:1.7;margin-top:12px}.update-release{display:flex;flex-direction:column;gap:8px;margin-top:16px;font-size:13px}.update-notes{white-space:pre-wrap;line-height:1.7;color:#bdcec1;font-size:12px}.update-progress{margin-top:14px;color:#a6bbad;font-size:11px}.update-track{height:5px;background:#304235;border-radius:5px;margin-bottom:8px;overflow:hidden}.update-track>view{height:100%;background:#dafa6b}@media(max-width:700px){.update-card{padding:16px}.update-heading{align-items:flex-start;flex-direction:column;gap:6px}}
</style>
