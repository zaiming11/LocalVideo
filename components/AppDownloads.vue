<template>
  <view class="downloads">
    <view class="downloads-heading">
      <AppIcon name="download" :size="18" color="#E8FF63" />
      <text>应用下载</text>
    </view>
    <text class="downloads-hint">扫码下载到其他设备，也可以复制链接在浏览器打开。点击二维码可放大查看。</text>
    <view class="download-grid">
      <view v-for="item in downloads" :key="item.id" class="download-card">
        <image
          class="download-qr"
          :src="qrCode(item)"
          mode="aspectFit"
          :aria-label="item.title + '二维码，点击放大'"
          @click="preview(item)"
        />
        <view class="download-info">
          <text class="download-title">{{ item.title }}</text>
          <text class="download-description">{{ item.description }}</text>
          <text class="download-caption">{{ item.id === 'web' ? '扫码打开网页版' : '扫码下载完整安装包' }}</text>
          <text class="download-url" selectable>{{ item.url }}</text>
          <button class="download-copy" @click="copyLink(item)">{{ item.id === 'web' ? '复制网页链接' : '复制下载链接' }}</button>
        </view>
      </view>
    </view>
    <text class="downloads-hint">若微信等扫码工具无法下载，请选择“在浏览器打开”。Windows 安装包请在电脑上安装。</text>
  </view>
</template>

<script setup>
import AppIcon from './AppIcon.vue'
import downloads from '../core/downloads.json'
import { showToast } from '../core/store.js'

const qrCode = item => '/static/downloads/' + item.id + '.png'

function preview(item) {
  uni.previewImage({ urls: [qrCode(item)], current: 0 })
}

function copyLink(item) {
  uni.setClipboardData({
    data: item.url,
    showToast: false,
    success: () => showToast('链接已复制，可在浏览器中打开', 'success'),
    fail: () => showToast('复制失败，请长按上方链接复制', 'error')
  })
}
</script>

<style scoped>
.downloads { padding: 20px; margin-top: 14px; border: 1px solid rgba(255, 255, 255, 0.065); border-radius: 16px; background: rgba(255, 255, 255, 0.024); }
.downloads-heading { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; }
.downloads-hint { display: block; margin-top: 10px; color: var(--muted, #97ac9f); font-size: 12px; line-height: 1.7; }
.download-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
.download-card { display: flex; flex-direction: column; align-items: center; gap: 14px; min-width: 0; padding: 18px 12px; border: 1px solid rgba(255, 255, 255, 0.065); border-radius: 12px; background: rgba(255, 255, 255, 0.018); }
.download-qr { display: block; width: 160px; height: 160px; flex-shrink: 0; background: #fff; border-radius: 8px; cursor: pointer; }
.download-info { display: flex; flex-direction: column; align-items: center; width: 100%; min-width: 0; gap: 6px; text-align: center; }
.download-title { font-size: 14px; font-weight: 750; }
.download-description, .download-caption { font-size: 11px; line-height: 1.6; color: var(--muted, #97ac9f); }
.download-caption { color: #c7d5c9; }
.download-url { display: block; max-width: 100%; color: #a7b9ac; font-size: 10px; line-height: 1.6; word-break: break-all; user-select: text; }
.download-copy { margin: 6px 0 0; padding: 8px 12px; border: 1px solid #43563e; border-radius: 8px; background: #263526; color: #e8ff63; font-size: 11px; line-height: 1.5; }
.download-copy::after { border: 0; }
@media (max-width: 760px) {
  .downloads { padding: 16px; }
  .download-grid { grid-template-columns: 1fr; }
  .download-card { flex-direction: row; gap: 14px; padding: 14px; }
  .download-qr { width: 136px; height: 136px; }
  .download-info { flex: 1; width: auto; align-items: flex-start; text-align: left; }
}
@media (max-width: 360px) {
  .download-card { flex-direction: column; }
  .download-qr { width: 160px; height: 160px; }
  .download-info { width: 100%; align-items: center; text-align: center; }
}
</style>
