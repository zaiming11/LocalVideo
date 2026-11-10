<template>
  <view class="subpage-header" :class="{ 'with-safe-area': safeArea }">
    <button class="subpage-back" role="button" aria-label="返回上一页" @click.stop="$emit('back')">
      <AppIcon name="arrow-left" :size="20" color="#EAF0EC" />
      <text>返回</text>
    </button>
    <text class="subpage-title">{{ title }}</text>
    <view class="subpage-balance" />
  </view>
</template>
<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ title: { type: String, default: '' }, safeArea: Boolean })
defineEmits(['back'])
</script>
<style scoped>
.subpage-header{position:sticky;top:0;z-index:24;display:flex;align-items:center;gap:12px;min-height:58px;box-sizing:border-box;background:#090d0e;color:#eaf0ec;border-bottom:1px solid #253334;margin-bottom:18px}
.subpage-header.with-safe-area{padding-top:var(--status-bar-height,0px)}
.subpage-back{display:flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;min-width:76px;min-height:44px;padding:8px 6px;margin:0;border:0;border-radius:8px;background:transparent;color:inherit;font-size:14px;line-height:1.5}
.subpage-back:after{border:0}.subpage-back:active{background:#23302b}.subpage-title{flex:1;min-width:0;text-align:center;font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.subpage-balance{width:76px;flex-shrink:0}
</style>
