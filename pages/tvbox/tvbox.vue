<template><view class="tvbox-route"><TVBoxPanel ref="panel" route-page @back="goBack" @settings="openHome('settings')" /></view></template>
<script setup>
import { ref } from 'vue'
import { onBackPress } from '@dcloudio/uni-app'
import TVBoxPanel from '../../components/TVBoxPanel.vue'
const panel = ref(null)
const openHome = tab => uni.reLaunch({ url: '/pages/home/home?tab=' + tab })
const goBack = () => uni.navigateBack({ delta: 1, fail: () => openHome('tvbox') })
onBackPress(() => panel.value?.handleBack() || false)
</script>
<style scoped>.tvbox-route{min-height:100vh;background:#090d0e;padding:calc(24px + var(--status-bar-height, 0px)) 5vw 40px;box-sizing:border-box}</style>
