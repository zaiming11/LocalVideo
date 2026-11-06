<template>
	<!-- ============================= H5 / Browser ============================= -->
	<!-- #ifdef H5 -->
	<view
		ref="shellRef"
		class="player-shell no-select"
		:class="{ 'is-fullscreen': isFullscreen, 'is-idle': !showControls, 'is-fill': isFullscreen && state.settings.fullscreenFill }"
		@click="onStageTap"
		@mousemove="onPointerMove"
	>
		<view class="player-ambient" :style="{ backgroundImage: current?.thumb ? `url('${current.thumb}')` : 'none' }" />
		<view class="player-ambient-mask" />
		<view ref="videoHostRef" class="h5-video-host" v-html="videoMarkup" />

		<view class="player-top-gradient" :class="{ 'is-visible': showControls }" />
		<view class="player-bottom-gradient" :class="{ 'is-visible': showControls }" />

		<!-- loading -->
		<view v-if="loading && !errorMessage" class="player-loading">
			<view class="loading-orbit"><view class="orbit-ring" /><AppIcon name="play" :size="18" color="#E8FF63" /></view>
			<text class="loading-text">正在准备播放…</text>
		</view>

		<!-- error -->
		<view v-if="errorMessage" class="player-error" @click.stop>
			<view class="error-icon"><AppIcon name="film" :size="30" color="#FFC478" :stroke="1.4" /></view>
			<text class="error-title">这个视频暂时无法播放</text>
			<text class="error-text">{{ errorMessage }}</text>
			<view class="error-actions">
				<view class="primary-btn press" @click.stop="retryPlayback">
					<AppIcon name="refresh" :size="14" color="#0A0D0A" />
					<text>重试</text>
				</view>
				<view class="ghost-btn press" @click.stop="goBack">
					<text>返回媒体库</text>
				</view>
			</view>
			<text class="error-hint">请先确认视频文件仍然存在且地址可访问。浏览器对视频编码的支持也会因设备而异。</text>
		</view>

		<!-- top bar -->
		<view class="player-topbar" :class="{ 'is-visible': showControls }">
			<view class="player-top-left">
				<view class="player-icon-btn press" @click.stop="goBack">
					<AppIcon name="arrow-left" :size="21" color="#F5F7F2" />
				</view>
				<view class="player-title-block">
					<text class="player-title clamp-1">{{ current?.title || '正在播放' }}</text>
					<view class="player-subtitle">
						<text class="player-folder clamp-1">{{ current?.folder || '本地视频' }}</text>
						<view class="dot folder-dot" />
						<text class="mono">{{ queueIndexLabel }}</text>
						<view class="dot" />
						<text class="auto-label" :class="{ 'is-off': !state.settings.autoNext }">
							{{ state.settings.autoNext ? '自动连播' : '单集播放' }}
						</text>
					</view>
				</view>
			</view>
			<view class="player-top-right">
				<view v-if="isFullscreen" class="fullscreen-fit-btn press" @click.stop="toggleFullscreenFill">
					<text>{{ state.settings.fullscreenFill ? '适应屏幕' : '满屏观影' }}</text>
				</view>
				<view class="player-icon-btn press" @click.stop="showMoreSheet = true">
					<AppIcon name="more" :size="20" color="#F5F7F2" />
				</view>
				<view class="player-icon-btn press" @click.stop="showPlaylist = !showPlaylist">
					<AppIcon name="playlist" :size="20" color="#F5F7F2" />
					<view class="queue-count">{{ queueVideos.length }}</view>
				</view>
			</view>
		</view>

		<!-- center controls -->
		<view class="center-controls" :class="{ 'is-visible': showControls }">
			<view class="center-side press" @click.stop="seekBy(-10)">
				<AppIcon name="rotate-ccw" :size="27" color="#FFFFFF" :stroke="1.5" />
				<text class="center-side-label">10 秒</text>
			</view>
			<view class="center-play press" @click.stop="togglePlay">
				<AppIcon :name="isPlaying ? 'pause' : 'play'" :size="34" :color="'#0A0D0A'" />
			</view>
			<view class="center-side press" @click.stop="seekBy(10)">
				<AppIcon name="rotate-cw" :size="27" color="#FFFFFF" :stroke="1.5" />
				<text class="center-side-label">10 秒</text>
			</view>
		</view>

		<view v-if="seekFeedback" class="seek-feedback">
			<AppIcon :name="seekFeedback > 0 ? 'rotate-cw' : 'rotate-ccw'" :size="14" color="#E8FF63" />
			<text>{{ seekFeedback > 0 ? '+' : '' }}{{ seekFeedback }} 秒</text>
		</view>

		<view v-if="resumeHint" class="resume-hint">
			<AppIcon name="clock" :size="13" color="#E8FF63" />
			<text>{{ resumeHint }}</text>
		</view>

		<!-- next up countdown -->
		<view v-if="showNextCard" class="up-next" @click.stop>
			<view class="up-next-label">
				<view class="live-dot" />
				<text>即将自动播放</text>
				<text class="up-next-count mono">{{ countdown }}</text>
			</view>
			<view class="up-next-row">
				<view class="up-next-thumb">
					<image v-if="nextVideo?.thumb" :src="nextVideo.thumb" mode="aspectFill" />
					<view v-else class="up-next-thumb-fallback"><AppIcon name="play" :size="14" color="#E8FF63" /></view>
				</view>
				<view class="up-next-copy">
					<text class="up-next-title clamp-1">{{ nextVideo?.title }}</text>
					<text class="up-next-meta">{{ nextVideo ? formatDuration(nextVideo.duration) : '' }} · 下一集</text>
				</view>
			</view>
			<view class="up-next-actions">
				<view class="up-next-cancel press" @click.stop="cancelNext">取消</view>
				<view class="up-next-play press" @click.stop="playNext">立即播放</view>
			</view>
		</view>

		<!-- end card -->
		<view v-if="showEndCard" class="end-overlay" @click.stop>
			<view class="end-card">
				<view class="end-kicker">END OF SCREENING</view>
				<text class="end-title">{{ nextVideo ? '本集播放结束' : '全部播放完毕' }}</text>
				<text class="end-sub">{{ nextVideo ? `下一集：${nextVideo.title}` : '这是队列中的最后一个视频' }}</text>
				<view class="end-actions">
					<view v-if="nextVideo" class="primary-btn press" @click.stop="playNext">
						<AppIcon name="play" :size="14" color="#0A0D0A" />
						<text>播放下一集</text>
					</view>
					<view v-else class="primary-btn press" @click.stop="replayCurrent">
						<AppIcon name="refresh" :size="14" color="#0A0D0A" />
						<text>重新播放</text>
					</view>
					<view class="ghost-btn press" @click.stop="replayCurrent">
						<AppIcon name="rotate-ccw" :size="14" color="#E9EDE4" />
						<text>重播本集</text>
					</view>
					<view class="ghost-btn press" @click.stop="goBack">
						<text>返回媒体库</text>
					</view>
				</view>
			</view>
		</view>

		<!-- bottom controls -->
		<view class="player-bottombar" :class="{ 'is-visible': showControls }" @click.stop>
			<view class="progress-row">
				<text class="time-text mono">{{ formatDuration(displayTime) }}</text>
				<view class="progress-slider-wrap">
					<view class="buffer-track">
						<view class="buffer-fill" :style="{ width: `${bufferedPercent}%` }" />
					</view>
					<slider
						class="progress-slider"
						:value="sliderValue"
						:max="1000"
						:min="0"
						:block-size="12"
						block-color="#E8FF63"
						activeColor="#E8FF63"
						backgroundColor="rgba(255,255,255,0.24)"
						@changing="onSliderChanging"
						@change="onSliderChange"
					/>
				</view>
				<text class="time-text time-text--right mono">-{{ formatDuration(remaining) }}</text>
			</view>

			<view class="control-row">
				<view class="control-left">
					<view class="control-btn press" @click.stop="seekBy(-10)">
						<AppIcon name="rotate-ccw" :size="19" color="#F5F7F2" />
					</view>
					<view class="control-btn control-btn--play press" @click.stop="togglePlay">
						<AppIcon :name="isPlaying ? 'pause' : 'play'" :size="18" color="#0A0D0A" />
					</view>
					<view class="control-btn press" @click.stop="seekBy(10)">
						<AppIcon name="rotate-cw" :size="19" color="#F5F7F2" />
					</view>
					<view class="volume-wrap">
						<view class="control-btn press" @click.stop="toggleMute">
							<AppIcon :name="muted || volume === 0 ? 'volume-x' : 'volume'" :size="19" color="#F5F7F2" />
						</view>
						<view class="volume-slider">
							<slider
								:value="Math.round(volume * 100)"
								:max="100"
								:min="0"
								:block-size="8"
								block-color="#F5F7F2"
								activeColor="#E8FF63"
								backgroundColor="rgba(255,255,255,0.22)"
								@changing="onVolumeChanging"
								@change="onVolumeChange"
							/>
						</view>
					</view>
					<view class="control-pill press" @click.stop="showSpeed = !showSpeed">
						<text class="mono">{{ rateLabel }}×</text>
					</view>
					<view class="control-pill control-pill--auto press" :class="{ 'is-off': !state.settings.autoNext }" @click.stop="toggleAutoNext">
						<view class="auto-dot" />
						<text>自动连播</text>
					</view>
				</view>

				<view class="control-right">
					<view class="control-btn press" @click.stop="switchToPrev">
						<AppIcon name="prev" :size="18" color="#F5F7F2" />
					</view>
					<view class="control-btn press" @click.stop="switchToNext">
						<AppIcon name="next" :size="18" color="#F5F7F2" />
					</view>
					<view class="control-btn press" @click.stop="showPlaylist = true">
						<AppIcon name="playlist" :size="19" color="#F5F7F2" />
					</view>
					<view class="control-btn press" @click.stop="toggleFullscreen">
						<AppIcon :name="isFullscreen ? 'fullscreen-exit' : 'fullscreen'" :size="19" color="#F5F7F2" />
					</view>
				</view>
			</view>

			<view class="keyboard-hint">
				<text>空格 播放/暂停</text>
				<view class="dot" />
				<text>← → 快退/快进</text>
				<view class="dot" />
				<text>F 全屏</text>
				<view class="dot" />
				<text>N 下一集</text>
			</view>
		</view>

		<view v-if="showSpeed" class="speed-popover" @click.stop>
			<text class="speed-title">播放速度</text>
			<view class="speed-options">
				<view
					v-for="item in rateOptions"
					:key="item"
					class="speed-option press"
					:class="{ 'is-active': rate === item }"
					@click.stop="setRate(item)"
				>
					{{ item }}×
				</view>
			</view>
		</view>

		<!-- playlist drawer -->
		<view v-if="showPlaylist" class="drawer-layer" @click.stop="showPlaylist = false">
			<view class="playlist-drawer" @click.stop>
				<view class="drawer-head">
					<view>
						<text class="section-kicker">UP NEXT</text>
						<text class="drawer-title">播放队列</text>
						<text class="drawer-sub">{{ queueVideos.length }} 个视频 · 来自当前筛选</text>
					</view>
					<view class="player-icon-btn press" @click="showPlaylist = false">
						<AppIcon name="x" :size="17" color="#C7CEC4" />
					</view>
				</view>
				<scroll-view class="queue-scroll" scroll-y>
					<view
						v-for="(item, index) in queueVideos"
						:key="item.id"
						class="queue-item press"
						:class="{ 'is-current': item.id === currentId }"
						@click="selectQueueItem(item)"
					>
						<text class="queue-index mono">{{ String(index + 1).padStart(2, '0') }}</text>
						<view class="queue-thumb">
							<image v-if="item.thumb" :src="item.thumb" mode="aspectFill" />
							<view v-else class="queue-thumb-fallback"><AppIcon name="film" :size="15" :color="item.accent || '#E8FF63'" /></view>
							<view v-if="item.id === currentId" class="queue-playing"><AppIcon :name="isPlaying ? 'pause' : 'play'" :size="10" color="#0A0D0A" /></view>
						</view>
						<view class="queue-copy">
							<text class="queue-title clamp-1">{{ item.title }}</text>
							<view class="queue-meta">
								<text>{{ formatDuration(item.duration) }}</text>
								<view class="dot" />
								<text>{{ extLabel(item.ext) }}</text>
							</view>
							<view v-if="queueProgress(item) > 0" class="queue-progress"><view :style="{ width: `${queueProgress(item) * 100}%` }" /></view>
						</view>
						<view v-if="item.id === currentId" class="queue-now">播放中</view>
					</view>
				</scroll-view>
			</view>
		</view>

		<!-- more / details sheet -->
		<BottomSheet :visible="showMoreSheet" title="播放信息" kicker="NOW PLAYING" @close="showMoreSheet = false">
			<view class="details-view-mode press" @click="toggleFullscreenFill">
				<view><text class="details-option-title">满屏观影</text><text class="details-option-desc">完整铺满，不裁切画面，比例可能变化</text></view>
				<view class="details-toggle" :class="{ 'is-on': state.settings.fullscreenFill }"><view /></view>
			</view>
			<view class="details-list">
				<view class="detail-row"><text>标题</text><text class="detail-value">{{ current?.title }}</text></view>
				<view class="detail-row"><text>文件夹</text><text class="detail-value">{{ current?.folder }}</text></view>
				<view class="detail-row"><text>文件名</text><text class="detail-value clamp-1">{{ current?.name }}</text></view>
				<view class="detail-row"><text>格式</text><text class="detail-value">{{ extLabel(current?.ext) }}</text></view>
				<view class="detail-row"><text>分辨率</text><text class="detail-value">{{ current?.width && current?.height ? `${current.width} × ${current.height}` : '未知' }}</text></view>
				<view class="detail-row"><text>大小</text><text class="detail-value">{{ formatBytes(current?.size) }}</text></view>
				<view class="detail-row"><text>时长</text><text class="detail-value">{{ formatDuration(duration) }}</text></view>
				<view class="detail-row"><text>最近播放</text><text class="detail-value">{{ current?.addedAt ? formatDate(current.addedAt) : '刚刚' }}</text></view>
			</view>
			<view class="details-actions">
				<view class="ghost-btn press" @click="showMoreSheet = false; showPlaylist = true">
					<AppIcon name="playlist" :size="14" color="#E9EDE4" />
					<text>查看队列</text>
				</view>
				<view class="ghost-btn press" @click="goBack">
					<text>返回媒体库</text>
				</view>
			</view>
		</BottomSheet>

		<AppToast />
	</view>
	<!-- #endif -->

	<!-- ============================= Android App ============================= -->
	<!-- #ifndef H5 -->
	<view class="app-player-page" :class="{ 'is-fullscreen': appFullscreen }">
		<view v-show="!appFullscreen" class="app-player-header">
			<view class="player-icon-btn press" @click="goBack">
				<AppIcon name="arrow-left" :size="21" color="#F5F7F2" />
			</view>
			<view class="app-header-copy">
				<text class="app-header-title clamp-1">{{ current?.title || '正在播放' }}</text>
				<text class="app-header-sub">{{ queueIndexLabel }} · {{ state.settings.autoNext ? '自动连播已开启' : '单集播放' }}</text>
			</view>
			<view class="player-icon-btn press" @click="openAppMore">
				<AppIcon name="more" :size="20" color="#F5F7F2" />
			</view>
		</view>

		<!-- 保持同一个原生播放器，切换全屏时只更新布局和画面比例。 -->
		<view class="app-video-stage" :class="{ 'is-fullscreen': appFullscreen }" :style="appStageStyle">
			<video
				v-memo="[current?.url, current?.thumb, appScreenLocked, appControlsVisible, appFullscreen, state.settings.fullscreenFill, appLayoutRevision, appVideoStyle, appPlayStrategy]"
				id="app-player"
				class="app-video"
				:data-layout-revision="appLayoutRevision"
				:style="appVideoStyle"
				:src="current?.url || ''"
				:poster="current?.thumb || ''"
				:controls="!appFullscreen || appControlsVisible"
				:autoplay="true"
				:show-fullscreen-btn="false"
				:show-play-btn="!appScreenLocked"
				:show-center-play-btn="!appScreenLocked"
				:enable-play-gesture="!appScreenLocked"
				:vslide-gesture="false"
				:vslide-gesture-in-fullscreen="false"
				:enable-progress-gesture="!appScreenLocked && !appFullscreen"
				:show-progress="true"
				:show-loading="true"
				codec="hardware"
				:play-strategy="appPlayStrategy"
				:object-fit="appFullscreen && state.settings.fullscreenFill ? 'fill' : 'contain'"
				@play="onAppPlay"
				@pause="onAppPause"
				@timeupdate="onAppTimeUpdate"
				@loadedmetadata="onAppLoadedMetadata"
				@ended="onAppEnded"
				@error="onAppError"
			/>
			<view v-if="appVideoError" class="app-video-error">
				<AppIcon name="film" :size="28" color="#FFC478" :stroke="1.4" />
				<text class="app-error-title">无法播放这个视频</text>
				<text class="app-error-text">{{ errorMessage }}</text>
				<view class="app-error-actions">
					<view class="primary-btn press" @click="retryAppPlayback">
						<AppIcon name="refresh" :size="14" color="#0A0D0A" />
						<text>重试</text>
					</view>
					<view class="ghost-btn press" @click="openSystemPlayer">
						<text>系统播放器</text>
					</view>
				</view>
			</view>
		</view>

		<view v-if="!appFullscreen" class="app-player-body">
			<view class="app-title-row">
				<view class="app-title-copy">
					<text class="app-now-title">{{ current?.title }}</text>
					<view class="app-meta-row">
						<text>{{ current?.folder || '本地视频' }}</text>
						<view class="dot" />
						<text>{{ extLabel(current?.ext) }}</text>
						<view class="dot" />
						<text>{{ formatBytes(current?.size) }}</text>
						<view class="dot" />
						<text>{{ current?.width && current?.height ? `${current.width}×${current.height}` : '未知分辨率' }}</text>
					</view>
				</view>
				<view class="app-auto-switch" :class="{ 'is-on': state.settings.autoNext }" @click="toggleAutoNext">
					<view class="app-auto-dot" />
					<text>连播</text>
				</view>
			</view>

			<view class="app-progress-panel">
				<view class="app-progress-track"><view class="app-progress-fill" :style="{ width: `${appProgressPercent}%` }" /></view>
				<view class="app-progress-row">
					<text class="mono">{{ formatDuration(position) }} / {{ formatDuration(duration) }}</text>
					<text>{{ appProgressPercent }}%</text>
				</view>
			</view>

			<view class="app-controls">
				<view class="app-control-btn press" @click="switchToPrev">
					<AppIcon name="prev" :size="21" color="#F5F7F2" />
					<text>上一集</text>
				</view>
				<view class="app-control-btn app-control-btn--play press" @click="toggleAppPlay">
					<AppIcon :name="appPlaying ? 'pause' : 'play'" :size="22" color="#0A0D0A" />
					<text>{{ appPlaying ? '暂停' : '播放' }}</text>
				</view>
				<view class="app-control-btn press" @click="switchToNext">
					<AppIcon name="next" :size="21" color="#F5F7F2" />
					<text>下一集</text>
				</view>
				<view class="app-control-btn press" @click="requestAppFullscreen">
					<AppIcon name="fullscreen" :size="21" color="#F5F7F2" />
					<text>全屏</text>
				</view>
			</view>

			<view class="app-speed-row">
				<text class="app-section-label">播放速度</text>
				<view class="app-speed-chips">
					<view
						v-for="item in rateOptions"
						:key="item"
						class="app-speed-chip press"
						:class="{ 'is-active': rate === item }"
						@click="setRate(item)"
					>{{ item }}×</view>
				</view>
			</view>

			<view class="app-next-hint">
				<AppIcon name="sun" :size="14" color="#8E968A" />
				<text>全屏时：左侧上下滑动调音量，右侧上下滑动调亮度</text>
			</view>
			<view class="app-adjustments">
				<view class="app-adjustment-row">
					<AppIcon :name="appVolume === 0 ? 'volume-x' : 'volume'" :size="18" color="#D3D9D0" />
					<text class="app-adjustment-label">音量</text>
					<slider class="app-adjustment-slider" :value="Math.round(appVolume * 100)" :min="0" :max="100" :block-size="14" block-color="#E8FF63" activeColor="#E8FF63" backgroundColor="#343A34" @changing="onAppAdjustmentSlider('volume', $event)" @change="onAppAdjustmentSlider('volume', $event, true)" />
					<text class="app-adjustment-value">{{ Math.round(appVolume * 100) }}%</text>
				</view>
				<view class="app-adjustment-row">
					<AppIcon name="sun" :size="18" color="#D3D9D0" />
					<text class="app-adjustment-label">亮度</text>
					<slider class="app-adjustment-slider" :value="Math.round(appBrightness * 100)" :min="5" :max="100" :block-size="14" block-color="#E8FF63" activeColor="#E8FF63" backgroundColor="#343A34" @changing="onAppAdjustmentSlider('brightness', $event)" @change="onAppAdjustmentSlider('brightness', $event, true)" />
					<text class="app-adjustment-value">{{ Math.round(appBrightness * 100) }}%</text>
				</view>
			</view>

			<view class="app-next-hint">
				<AppIcon name="info" :size="14" color="#8E968A" />
				<text>{{ state.settings.autoNext ? '本集结束后会自动播放队列中的下一集' : '自动连播已关闭，可在上方开启' }}</text>
			</view>

			<view class="app-queue">
				<view class="app-queue-head">
					<view>
						<text class="section-kicker">UP NEXT</text>
						<text class="app-queue-title">播放队列</text>
					</view>
					<text class="app-queue-count">{{ queueVideos.length }} 个视频</text>
				</view>
				<scroll-view class="app-queue-list" :scroll-y="true" :scroll-top="appQueueScrollTop" @scroll="onAppQueueScroll">
					<view :style="{ height: `${appQueueStart * APP_QUEUE_ROW_HEIGHT}px` }" />
					<view
						v-for="(item, index) in appQueueVideos"
						:key="item.id"
						class="app-queue-item press"
						:class="{ 'is-current': item.id === currentId }"
						@click="selectQueueItem(item)"
					>
						<text class="app-queue-index mono">{{ String(appQueueStart + index + 1).padStart(2, '0') }}</text>
						<view class="app-queue-thumb">
							<image v-if="item.thumb" :src="item.thumb" mode="aspectFill" />
							<view v-else class="app-queue-fallback"><AppIcon name="film" :size="14" :color="item.accent || '#E8FF63'" /></view>
						</view>
						<view class="app-queue-copy">
							<text class="app-queue-item-title clamp-1">{{ item.title }}</text>
							<text class="app-queue-item-meta">{{ formatDuration(item.duration) }} · {{ extLabel(item.ext) }}</text>
						</view>
						<AppIcon v-if="item.id === currentId" name="volume" :size="15" color="#E8FF63" />
						<AppIcon v-else name="chevron-right" :size="14" color="#59615A" />
					</view>
					<view :style="{ height: `${Math.max(0, queueVideos.length - appQueueStart - appQueueVideos.length) * APP_QUEUE_ROW_HEIGHT}px` }" />
				</scroll-view>
			</view>

			<view class="app-player-footer">
				<text>本地播放 · 文件不会离开你的设备</text>
			</view>
		</view>

		<view v-if="showEndCard" class="app-end-card" @click.stop>
			<view class="app-end-icon"><AppIcon name="check" :size="22" color="#0A0D0A" :stroke="2.4" /></view>
			<text class="app-end-title">{{ nextVideo ? '本集播放结束' : '全部播放完毕' }}</text>
			<text class="app-end-sub">{{ nextVideo ? `下一集：${nextVideo.title}` : '队列中的视频已全部播放' }}</text>
			<view class="app-end-actions">
				<view v-if="nextVideo" class="primary-btn press" @click="playNext">
					<AppIcon name="play" :size="14" color="#0A0D0A" />
					<text>播放下一集</text>
				</view>
				<view v-else class="primary-btn press" @click="replayCurrent">
					<AppIcon name="refresh" :size="14" color="#0A0D0A" />
					<text>重新播放</text>
				</view>
				<view class="ghost-btn press" @click="showEndCard = false">
					<text>收起</text>
				</view>
			</view>
		</view>

		<BottomSheet :visible="showMoreSheet" title="播放信息" kicker="NOW PLAYING" @close="showMoreSheet = false">
			<view class="details-list">
				<view class="detail-row"><text>标题</text><text class="detail-value">{{ current?.title }}</text></view>
				<view class="detail-row"><text>文件夹</text><text class="detail-value">{{ current?.folder }}</text></view>
				<view class="detail-row"><text>文件名</text><text class="detail-value clamp-1">{{ current?.name }}</text></view>
				<view class="detail-row"><text>格式</text><text class="detail-value">{{ extLabel(current?.ext) }}</text></view>
				<view class="detail-row"><text>分辨率</text><text class="detail-value">{{ current?.width && current?.height ? `${current.width} × ${current.height}` : '未知' }}</text></view>
				<view class="detail-row"><text>大小</text><text class="detail-value">{{ formatBytes(current?.size) }}</text></view>
				<view class="detail-row"><text>时长</text><text class="detail-value">{{ formatDuration(duration) }}</text></view>
			</view>
			<view class="details-actions">
				<view class="primary-btn press" @click="openSystemPlayer">
					<AppIcon name="arrow-up-right" :size="14" color="#0A0D0A" />
					<text>系统播放器打开</text>
				</view>
				<view class="ghost-btn press" @click="goBack">
					<text>返回媒体库</text>
				</view>
			</view>
		</BottomSheet>

		<AppToast />
	</view>
	<!-- #endif -->
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBackPress, onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import AppToast from '../../components/AppToast.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import {
	getResumePosition,
	getVideoById,
	initStore,
	markPlayed,
	progressPercent,
	recordProgress,
	saveState,
	setCurrent,
	setQueue,
	setSetting,
	showToast,
	state,
	useVideoStore
} from '../../core/store.js'
import {
	clamp,
	extLabel,
	formatBytes,
	formatDate,
	formatDuration,
	isApp as detectApp,
	isH5 as detectH5
} from '../../core/utils.js'
import { openWithSystemPlayer } from '../../core/media.js'
import { createAppFullscreenControls } from '../../core/app-fullscreen-controls.js'
import { getAndroidPlayStrategy } from '../../core/android-playback.js'
import { createAppPlaybackAdjustments } from '../../core/app-playback-adjustments.js'

initStore()
const { sortedVideos } = useVideoStore()
const isH5 = detectH5()
const isApp = detectApp()
const instance = getCurrentInstance()

const videoMarkup = '<video id="h5-video" class="h5-video" playsinline webkit-playsinline preload="metadata"></video>'
const shellRef = ref(null)
const videoHostRef = ref(null)
const currentId = ref('')
const current = computed(() => getVideoById(currentId.value))
const queueVideos = computed(() => state.queue.map(getVideoById).filter(Boolean))
const currentIndex = computed(() => queueVideos.value.findIndex((video) => video.id === currentId.value))
const queueIndexLabel = computed(() => {
	if (!queueVideos.value.length) return '0 / 0'
	return `${Math.max(1, currentIndex.value + 1)} / ${queueVideos.value.length}`
})
const nextVideo = computed(() => {
	const index = currentIndex.value
	return index >= 0 ? queueVideos.value[index + 1] || null : null
})
const prevVideo = computed(() => {
	const index = currentIndex.value
	return index > 0 ? queueVideos.value[index - 1] : null
})

const isPlaying = ref(false)
const appPlaying = ref(false)
const position = ref(0)
const duration = ref(0)
const buffered = ref(0)
const volume = ref(Number(state.settings.volume) || 1)
const muted = ref(!!state.settings.muted)
const rate = ref(Number(state.settings.defaultRate) || 1)
const loading = ref(true)
const showControls = ref(true)
const isFullscreen = ref(false)
const appFullscreen = ref(false)
const appScreenLocked = ref(false)
const appControlsVisible = ref(false)
const appVolume = ref(1)
const appBrightness = ref(0.5)
const appPlayStrategy = ref(0)
const appViewport = ref({ width: 0, height: 0 })
const appStageStyle = computed(() => appFullscreen.value ? { width: `${appViewport.value.width}px`, height: `${appViewport.value.height}px` } : {})
const appVideoStyle = computed(() => appFullscreen.value ? appStageStyle.value : { width: '100%', height: '100%' })
const appLayoutRevision = ref(0)
const APP_QUEUE_ROW_HEIGHT = 54
const APP_QUEUE_WINDOW_SIZE = 8
const appQueueScrollTop = ref(0)
const appQueueScrollY = ref(0)
const appQueueStart = computed(() => Math.max(0, Math.min(Math.floor(appQueueScrollY.value / APP_QUEUE_ROW_HEIGHT) - 1, queueVideos.value.length - APP_QUEUE_WINDOW_SIZE)))
const appQueueVideos = computed(() => queueVideos.value.slice(appQueueStart.value, appQueueStart.value + APP_QUEUE_WINDOW_SIZE))
const showPlaylist = ref(false)
const showSpeed = ref(false)
const showMoreSheet = ref(false)
const showNextCard = ref(false)
const showEndCard = ref(false)
const countdown = ref(5)
const errorMessage = ref('')
const appVideoError = ref(false)
const resumeHint = ref('')
const seekFeedback = ref(0)
const isSeeking = ref(false)
const seekPreview = ref(0)
const rateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2]

let videoEl = null
let appContext = null
let hideTimer = null
let countdownTimer = null
let resumeTimer = null
let seekFeedbackTimer = null
let lastSaveAt = 0
let lastAppUiUpdateAt = 0
let appPlaybackPosition = null
let appPlaybackDuration = 0
let pendingSeek = 0
let pendingAppSeek = 0
let appControlsTimer = null
let appFullscreenControls = null
let appAdjustments = null
const lastAdjustmentAt = { volume: 0, brightness: 0 }

const rateLabel = computed(() => {
	const value = Number(rate.value)
	return value.toFixed(2).replace(/\.?0+$/, '')
})
const displayTime = computed(() => (isSeeking.value ? seekPreview.value : position.value))
const remaining = computed(() => Math.max(0, (duration.value || 0) - displayTime.value))
const sliderValue = computed(() => {
	const total = duration.value || 0
	if (!total) return 0
	return Math.round(clamp(displayTime.value / total, 0, 1) * 1000)
})
const bufferedPercent = computed(() => {
	const total = duration.value || 0
	return total ? clamp((buffered.value / total) * 100, 0, 100) : 0
})
const appProgressPercent = computed(() => {
	const total = duration.value || 0
	return total ? Math.round(clamp(position.value / total, 0, 1) * 100) : 0
})

onLoad((options = {}) => {
	const requested = decodeURIComponent(options.id || '')
	initPlayback(requested)
})

onMounted(() => {
	// #ifdef H5
	nextTick(() => {
		videoEl = document.getElementById('h5-video')
		if (!videoEl) {
			setTimeout(() => {
				videoEl = document.getElementById('h5-video')
				if (videoEl) {
					bindH5Video()
					loadCurrentH5()
				}
			}, 80)
			return
		}
		bindH5Video()
		loadCurrentH5()
	})
	window.addEventListener('keydown', onKeydown)
	document.addEventListener('fullscreenchange', onFullscreenChange)
	document.addEventListener('visibilitychange', onVisibilityChange)
	window.addEventListener('beforeunload', onBeforeUnload)
	// #endif

	// #ifdef APP-PLUS
	syncAppAdjustments()
	uni.onWindowResize(refreshAppControls)
	nextTick(() => {
		appContext = uni.createVideoContext('app-player', instance?.proxy)
	})
	// #endif
})

onHide(() => {
	appAdjustments?.restoreBrightness()
	saveCurrentProgress()
	saveState({ immediate: true })
})

onShow(() => {
	if (!isApp || !appAdjustments) return
	try { appAdjustments.resume(); syncAppAdjustments() } catch (error) { /* activity is resuming */ }
})

onBackPress(() => {
	if (!isApp || !appFullscreen.value) return false
	if (!appScreenLocked.value) exitAppFullscreen()
	return true
})

onUnload(() => {
	saveCurrentProgress()
	saveState({ immediate: true })
	cleanup()
})

onBeforeUnmount(() => {
	cleanup()
})

watch(
	() => current.value?.id,
	() => {
		if (!current.value) return
		if (isH5) {
			nextTick(() => loadCurrentH5())
		} else {
			nextTick(() => {
				if (!appContext) appContext = uni.createVideoContext('app-player', instance?.proxy)
				setTimeout(() => {
					if (!appContext || !current.value) return
					if (pendingAppSeek > 0) {
						seekAppTo(pendingAppSeek)
						pendingAppSeek = 0
					}
					appContext.play()
				}, 120)
			})
		}
	},
	{ flush: 'post' }
)

watch(currentIndex, (index) => {
	appQueueScrollTop.value = Math.max(0, index - 3) * APP_QUEUE_ROW_HEIGHT
	appQueueScrollY.value = appQueueScrollTop.value
}, { immediate: true })

function onAppQueueScroll(event) {
	appQueueScrollY.value = Number(event?.detail?.scrollTop) || 0
}

function initPlayback(requestedId) {
	const allIds = sortedVideos.value.map((video) => video.id)
	let queue = state.queue.filter((id) => getVideoById(id))
	let id = requestedId || state.currentId || ''
	if (!queue.length || (id && !queue.includes(id))) {
		queue = allIds.slice()
	}
	if (!id || !getVideoById(id)) {
		id = queue[0] || state.videos[0]?.id || ''
	}
	if (!id) {
		errorMessage.value = '媒体库中还没有可播放的视频。'
		loading.value = false
		return
	}
	if (!queue.includes(id)) queue.unshift(id)
	setQueue(queue, id)
	setCurrent(id)
	currentId.value = id
	const video = getVideoById(id)
	if (video) {
		if (isApp) appPlayStrategy.value = getAndroidPlayStrategy(video)
		markPlayed(video)
		rate.value = Number(state.settings.defaultRate) || 1
		pendingSeek = getResumePosition(video)
		pendingAppSeek = pendingSeek
	}
}

/* ---------------------------------- H5 ---------------------------------- */

function bindH5Video() {
	if (!videoEl) return
	videoEl.addEventListener('loadedmetadata', onH5LoadedMetadata)
	videoEl.addEventListener('timeupdate', onH5TimeUpdate)
	videoEl.addEventListener('play', onH5Play)
	videoEl.addEventListener('pause', onH5Pause)
	videoEl.addEventListener('waiting', onH5Waiting)
	videoEl.addEventListener('playing', onH5Playing)
	videoEl.addEventListener('canplay', onH5CanPlay)
	videoEl.addEventListener('ended', onH5Ended)
	videoEl.addEventListener('error', onH5Error)
	videoEl.addEventListener('progress', onH5Progress)
	videoEl.addEventListener('volumechange', onH5VolumeChange)
}

function loadCurrentH5() {
	if (!isH5 || !videoEl) return
	const video = current.value
	if (!video) return
	clearNextCountdown()
	showEndCard.value = false
	showNextCard.value = false
	errorMessage.value = ''
	loading.value = true
	position.value = 0
	duration.value = Number(video.duration) || 0
	buffered.value = 0
	seekFeedback.value = 0
	const saved = getResumePosition(video)
	pendingSeek = saved
	videoEl.poster = video.thumb || ''
	videoEl.src = video.url
	videoEl.volume = clamp(volume.value, 0, 1)
	videoEl.muted = muted.value
	videoEl.playbackRate = rate.value
	markPlayed(video)
	try { videoEl.load() } catch (e) { /* noop */ }
	const playPromise = videoEl.play()
	if (playPromise && typeof playPromise.catch === 'function') {
		playPromise.catch(() => {
			isPlaying.value = false
			loading.value = false
			showControls.value = true
		})
	}
	scheduleHide()
}

function onH5LoadedMetadata() {
	if (!videoEl) return
	duration.value = Number.isFinite(videoEl.duration) ? videoEl.duration : Number(current.value?.duration) || 0
	loading.value = false
	videoEl.volume = clamp(volume.value, 0, 1)
	videoEl.muted = muted.value
	videoEl.playbackRate = rate.value
	if (pendingSeek > 2 && (!duration.value || pendingSeek < duration.value - 2)) {
		try {
			videoEl.currentTime = pendingSeek
			showResumeHint(pendingSeek)
		} catch (e) { /* noop */ }
	}
	pendingSeek = 0
}

function onH5TimeUpdate() {
	if (!videoEl) return
	if (!isSeeking.value) position.value = videoEl.currentTime || 0
	if (Number.isFinite(videoEl.duration)) duration.value = videoEl.duration
	const now = Date.now()
	if (state.settings.rememberProgress && current.value && now - lastSaveAt > 3000) {
		lastSaveAt = now
		recordProgress(current.value, videoEl.currentTime, videoEl.duration || duration.value)
	}
}

function onH5Play() {
	isPlaying.value = true
	loading.value = false
	showControls.value = true
	scheduleHide()
}

function onH5Pause() {
	isPlaying.value = false
	showControls.value = true
	clearTimeout(hideTimer)
	saveCurrentProgress()
}

function onH5Waiting() {
	loading.value = true
}

function onH5Playing() {
	loading.value = false
	isPlaying.value = true
}

function onH5CanPlay() {
	loading.value = false
}

function onH5Ended() {
	isPlaying.value = false
	showControls.value = true
	showEndCard.value = false
	position.value = duration.value || position.value
	saveCurrentProgress(true)
	clearNextCountdown()
	showNextCard.value = false
	if (state.settings.autoNext && nextVideo.value) {
		startNextCountdown()
	} else {
		showEndCard.value = true
	}
}

function onH5Error() {
	loading.value = false
	isPlaying.value = false
	const code = videoEl?.error?.code
	if (code === 4) {
		errorMessage.value = '视频源无法加载，可能是地址无法访问、文件已移动，或浏览器不支持此视频编码。'
	} else if (code === 3) {
		errorMessage.value = '视频解码失败，文件可能已损坏或使用了不支持的编码。'
	} else if (code === 2) {
		errorMessage.value = '视频读取中断，请检查网络或本地视频服务后重试。'
	} else {
		errorMessage.value = '无法读取这个视频文件，请检查文件是否仍然存在。'
	}
}

function onH5Progress() {
	if (!videoEl) return
	try {
		if (videoEl.buffered.length) {
			buffered.value = videoEl.buffered.end(videoEl.buffered.length - 1)
		}
	} catch (e) { /* noop */ }
}

function onH5VolumeChange() {
	if (!videoEl) return
	volume.value = videoEl.volume
	muted.value = videoEl.muted
	state.settings.volume = videoEl.volume
	state.settings.muted = videoEl.muted
}

function onH5EndedResume() {
	// reserved for future autoplay policies
}

/* --------------------------------- common -------------------------------- */

function saveCurrentProgress(completed = false) {
	const video = current.value
	if (!video) return
	let pos = position.value
	let total = duration.value || Number(video.duration) || 0
	if (isApp) {
		pos = appPlaybackPosition ?? pos
		total = appPlaybackDuration || total
	}
	if (isH5 && videoEl) {
		pos = completed ? videoEl.duration : videoEl.currentTime
		total = videoEl.duration || total
	}
	if (!Number.isFinite(pos) || pos < 1) return
	recordProgress(video, pos, total, { completed })
	if (completed) saveState({ immediate: true })
}

function showResumeHint(seconds) {
	resumeHint.value = `已续播 ${formatDuration(seconds)}`
	if (resumeTimer) clearTimeout(resumeTimer)
	resumeTimer = setTimeout(() => {
		resumeHint.value = ''
		resumeTimer = null
	}, 3600)
}

function showSeekFeedback(seconds) {
	seekFeedback.value = seconds
	if (seekFeedbackTimer) clearTimeout(seekFeedbackTimer)
	seekFeedbackTimer = setTimeout(() => {
		seekFeedback.value = 0
		seekFeedbackTimer = null
	}, 700)
}

function togglePlay() {
	if (isH5) {
		if (!videoEl || errorMessage.value) return
		if (videoEl.paused) {
			videoEl.play().catch(() => { isPlaying.value = false })
		} else {
			videoEl.pause()
		}
		return
	}
	toggleAppPlay()
}

function toggleAppPlay() {
	if (!appContext) appContext = uni.createVideoContext('app-player', instance?.proxy)
	if (appPlaying.value) {
		appContext.pause()
		appPlaying.value = false
	} else {
		appContext.play()
		appPlaying.value = true
	}
}

function toggleAppPlayFromNative() {
	// state is driven by @timeupdate / native controls
}

function seekBy(seconds) {
	if (isH5) {
		if (!videoEl) return
		const total = videoEl.duration || duration.value || 0
		if (!total) return
		videoEl.currentTime = clamp(videoEl.currentTime + seconds, 0, Math.max(0, total - 0.15))
		showSeekFeedback(seconds)
		revealControls()
		return
	}
	if (!appContext) return
	const total = duration.value || current.value?.duration || 0
	if (!total) return
	const target = clamp((appPlaybackPosition ?? position.value) + seconds, 0, Math.max(0, total - 0.5))
	seekAppTo(target)
	showSeekFeedback(seconds)
}

function seekAppTo(seconds) {
	const requested = Number(seconds)
	if (!appContext || !Number.isFinite(requested)) return
	const total = appPlaybackDuration || duration.value || Number(current.value?.duration) || 0
	// Android IJK 的桥接层使用 Integer.parseInt，传小数会直接拒绝跳转。
	const target = Math.floor(clamp(requested, 0, total > 0 ? Math.max(0, total - 0.1) : Math.max(0, requested)))
	appContext.seek(target)
	appPlaybackPosition = target
	position.value = target
	return target
}

function seekTo(seconds) {
	const total = duration.value || 0
	if (!total) return
	const target = clamp(seconds, 0, Math.max(0, total - 0.1))
	if (isH5 && videoEl) {
		videoEl.currentTime = target
		position.value = target
		return
	}
	seekAppTo(seconds)
}

function onSliderChanging(event) {
	isSeeking.value = true
	const percent = Number(event.detail.value) / 1000
	seekPreview.value = percent * (duration.value || 0)
}

function onSliderChange(event) {
	const percent = Number(event.detail.value) / 1000
	const target = percent * (duration.value || 0)
	isSeeking.value = false
	seekTo(target)
}

function onVolumeChanging(event) {
	const value = clamp(Number(event.detail.value) / 100, 0, 1)
	volume.value = value
	if (videoEl) {
		videoEl.volume = value
		if (value > 0) videoEl.muted = false
	}
	muted.value = value === 0
}

function onVolumeChange(event) {
	onVolumeChanging(event)
	state.settings.volume = volume.value
	state.settings.muted = muted.value
}

function toggleMute() {
	if (!videoEl) return
	const nextMuted = !videoEl.muted
	videoEl.muted = nextMuted
	muted.value = nextMuted
	state.settings.muted = nextMuted
}

function setRate(value) {
	rate.value = Number(value)
	if (isH5 && videoEl) videoEl.playbackRate = rate.value
	if (isApp) {
		if (!appContext) appContext = uni.createVideoContext('app-player', instance?.proxy)
		try { appContext.playbackRate(rate.value) } catch (e) { /* noop */ }
	}
	showSpeed.value = false
	showToast(`播放速度 ${rateLabel.value}×`, 'default', 1400)
}

function toggleAutoNext() {
	setSetting('autoNext', !state.settings.autoNext)
	showToast(state.settings.autoNext ? '已开启自动连播' : '已关闭自动连播', 'default', 1600)
	if (!state.settings.autoNext) clearNextCountdown()
}

function startNextCountdown() {
	clearNextCountdown()
	countdown.value = 5
	showNextCard.value = true
	countdownTimer = setInterval(() => {
		countdown.value -= 1
		if (countdown.value <= 0) {
			clearNextCountdown()
			playNext()
		}
	}, 1000)
}

function clearNextCountdown() {
	if (countdownTimer) {
		clearInterval(countdownTimer)
		countdownTimer = null
	}
	showNextCard.value = false
}

function cancelNext() {
	clearNextCountdown()
	showEndCard.value = true
}

function playNext() {
	const next = nextVideo.value
	clearNextCountdown()
	showEndCard.value = false
	if (!next) {
		showEndCard.value = true
		return
	}
	switchTo(next.id)
}

function switchToNext() {
	if (nextVideo.value) {
		playNext()
	} else {
		showToast('已经是最后一个视频了')
	}
}

function switchToPrev() {
	if (prevVideo.value) {
		switchTo(prevVideo.value.id)
	} else {
		showToast('已经是第一个视频了')
	}
}

function switchTo(id) {
	const video = getVideoById(id)
	if (!video) {
		showToast('视频文件不可用', 'error')
		return
	}
	saveCurrentProgress()
	clearNextCountdown()
	showEndCard.value = false
	showPlaylist.value = false
	showSpeed.value = false
	errorMessage.value = ''
	appVideoError.value = false
	if (isApp) appPlayStrategy.value = getAndroidPlayStrategy(video)
	currentId.value = id
	setCurrent(id)
	markPlayed(video)
	pendingSeek = getResumePosition(video)
	pendingAppSeek = pendingSeek
	appPlaybackPosition = null
	appPlaybackDuration = Number(video.duration) || 0
	lastSaveAt = Date.now()
	position.value = 0
	duration.value = Number(video.duration) || 0
	// The current-id watcher loads the new source for both H5 and App.
}

function selectQueueItem(item) {
	if (!item) return
	showPlaylist.value = false
	if (item.id !== currentId.value) {
		switchTo(item.id)
	} else {
		showControls.value = true
	}
}

function replayCurrent() {
	showEndCard.value = false
	showNextCard.value = false
	if (isH5 && videoEl) {
		videoEl.currentTime = 0
		position.value = 0
		videoEl.play().catch(() => {})
		return
	}
	position.value = 0
	appPlaybackPosition = 0
	if (!appContext) appContext = uni.createVideoContext('app-player', instance?.proxy)
	seekAppTo(0)
	appContext.play()
	appPlaying.value = true
}

function retryPlayback() {
	errorMessage.value = ''
	loading.value = true
	if (isH5) {
		if (videoEl) {
			videoEl.load()
			videoEl.play().catch(() => { loading.value = false })
		}
		return
	}
	retryAppPlayback()
}

function requestAppFullscreen() {
	if (appFullscreen.value) return
	try {
		// 通过页面布局进入全屏，原生 video 和播放进度始终保留。
		appScreenLocked.value = false
		updateAppViewport()
		appFullscreen.value = true
		plus.navigator.setFullscreen(true)
		plus.screen.lockOrientation('landscape-primary')
		refreshAppControls()
	} catch (e) {
		exitAppFullscreen()
		showToast('当前设备不支持全屏')
	}
}

function exitAppFullscreen() {
	if (!appFullscreen.value) return
	syncAppProgressUi()
	syncAppAdjustments()
	appScreenLocked.value = false
	appFullscreen.value = false
	try {
		plus.navigator.setFullscreen(false)
		plus.screen.lockOrientation('portrait-primary')
		refreshAppControls()
	} catch (error) { /* the native view may already have closed */ }
}

function toggleFullscreenFill() {
	setSetting('fullscreenFill', !state.settings.fullscreenFill)
	if (isApp) refreshAppControls()
}

function syncAppAdjustments() {
	try {
		if (!appAdjustments) appAdjustments = createAppPlaybackAdjustments()
		const values = appAdjustments.read()
		appVolume.value = values.volume
		appBrightness.value = values.brightness
	} catch (error) { /* controls can retry when the activity is ready */ }
}

function applyAppAdjustment(kind, value) {
	if (appScreenLocked.value) return undefined
	if (!appAdjustments) appAdjustments = createAppPlaybackAdjustments()
	if (kind === 'volume') {
		appVolume.value = appAdjustments.setVolume(value)
		return appVolume.value
	}
	appBrightness.value = appAdjustments.setBrightness(value)
	return appBrightness.value
}

function changeAppAdjustment(kind, value) {
	if (appScreenLocked.value) return undefined
	try {
		return applyAppAdjustment(kind, value)
	} catch (error) {
		showToast(kind === 'volume' ? '暂时无法调节音量' : '暂时无法调节亮度', 'error')
	}
}

function onAppAdjustmentSlider(kind, event, finished = false) {
	if (appScreenLocked.value) return
	const value = clamp(Number(event?.detail?.value) / 100, kind === 'brightness' ? 0.05 : 0, 1)
	if (kind === 'volume') appVolume.value = value
	else appBrightness.value = value
	const now = Date.now()
	if (!finished && now - lastAdjustmentAt[kind] < 80) return
	lastAdjustmentAt[kind] = now
	try { applyAppAdjustment(kind, value) } catch (error) {
		if (finished) showToast(kind === 'volume' ? '暂时无法调节音量' : '暂时无法调节亮度', 'error')
	}
}

function refreshAppControls() {
	clearTimeout(appControlsTimer)
	appFullscreenControls?.update({ visible: false })
	if (!appFullscreen.value) return
	updateAppViewport()
	appLayoutRevision.value++
	// 等原生视频完成旋转和布局，再显示独立的原生按钮。
	appControlsTimer = setTimeout(() => {
		if (!appFullscreen.value) return
		if (!appFullscreenControls) {
			appFullscreenControls = createAppFullscreenControls({
				onExit: exitAppFullscreen, onMore: openAppMore, onLock: toggleAppScreenLock,
				onVolumeChange: (value) => changeAppAdjustment('volume', value),
				onBrightnessChange: (value) => changeAppAdjustment('brightness', value),
				onSeek: (seconds) => {
					if (!appFullscreen.value || appScreenLocked.value || !appContext) return
					const total = appPlaybackDuration || duration.value || Number(current.value?.duration) || 0
					if (!(total > 0) || !Number.isFinite(seconds)) return
					const target = clamp(seconds, 0, Math.max(0, total - 0.5))
					seekAppTo(target)
				},
				readPlayback: () => ({ position: appPlaybackPosition ?? position.value, duration: appPlaybackDuration || duration.value || Number(current.value?.duration) || 0 }),
				onVisibilityChange: (visible) => { appControlsVisible.value = visible },
				readAdjustments: () => { syncAppAdjustments(); return { volume: appVolume.value, brightness: appBrightness.value } }
			})
		}
		const info = uni.getSystemInfoSync()
		const width = Math.max(info.screenWidth || info.windowWidth, info.screenHeight || info.windowHeight)
		const height = Math.min(info.screenWidth || info.windowWidth, info.screenHeight || info.windowHeight)
		syncAppAdjustments()
		appFullscreenControls.update({ visible: true, locked: appScreenLocked.value, width, height, volume: appVolume.value, brightness: appBrightness.value })
	}, 350)
}

function updateAppViewport() {
	const info = uni.getSystemInfoSync()
	appViewport.value = {
		width: Math.max(info.screenWidth || info.windowWidth, info.screenHeight || info.windowHeight),
		height: Math.min(info.screenWidth || info.windowWidth, info.screenHeight || info.windowHeight)
	}
}

function openAppMore() {
	uni.showActionSheet({
		itemList: [state.settings.fullscreenFill ? '关闭满屏观影' : '开启满屏观影', appFullscreen.value ? '锁定屏幕' : '播放信息', appFullscreen.value ? '退出全屏' : '返回媒体库'],
		success: ({ tapIndex }) => {
			if (tapIndex === 0) toggleFullscreenFill()
			else if (tapIndex === 1) {
				if (appFullscreen.value) toggleAppScreenLock()
				else showMoreSheet.value = true
			} else if (tapIndex === 2) {
				if (appFullscreen.value) exitAppFullscreen()
				else goBack()
			}
		}
	})
}

function toggleAppScreenLock() {
	appScreenLocked.value = !appScreenLocked.value
	refreshAppControls()
}

function retryAppPlayback() {
	appVideoError.value = false
	errorMessage.value = ''
	nextTick(() => {
		if (!appContext) appContext = uni.createVideoContext('app-player', instance?.proxy)
		seekAppTo(position.value || 0)
		appContext.play()
	})
}

function openSystemPlayer() {
	const opened = openWithSystemPlayer(current.value)
	if (!opened) showToast('未找到可用的系统播放器', 'error')
}

function toggleFullscreen() {
	// #ifdef H5
	const element = shellRef.value?.$el || shellRef.value
	if (!document.fullscreenElement) {
		const request = element?.requestFullscreen || element?.webkitRequestFullscreen
		if (request) {
			Promise.resolve(request.call(element)).then(() => {
				if (screen.orientation?.lock) {
					screen.orientation.lock('landscape').catch(() => {})
				}
			}).catch(() => {
				showToast('当前浏览器不允许进入全屏')
			})
		} else if (videoEl?.webkitEnterFullscreen) {
			videoEl.webkitEnterFullscreen()
		} else {
			showToast('当前浏览器不支持全屏')
		}
	} else {
		document.exitFullscreen?.()
	}
	// #endif
	// #ifdef APP-PLUS
	requestAppFullscreen()
	// #endif
}

function onFullscreenChange() {
	// #ifdef H5
	isFullscreen.value = !!document.fullscreenElement
	// #endif
	if (isFullscreen.value) {
		showControls.value = true
		scheduleHide()
	}
}

function onVisibilityChange() {
	if (document.visibilityState === 'hidden') {
		saveCurrentProgress()
		saveState({ immediate: true })
	}
}

function onBeforeUnload() {
	saveCurrentProgress()
	saveState({ immediate: true })
}

function revealControls() {
	showControls.value = true
	scheduleHide()
}

function scheduleHide() {
	clearTimeout(hideTimer)
	if (!isPlaying.value) return
	hideTimer = setTimeout(() => {
		if (isPlaying.value && !showPlaylist.value && !showSpeed.value && !showEndCard.value && !showNextCard.value) {
			showControls.value = false
			showSpeed.value = false
		}
	}, 2800)
}

function onStageTap() {
	if (loading.value || errorMessage.value) return
	if (showControls.value && isPlaying.value) {
		showControls.value = false
		showSpeed.value = false
	} else {
		showControls.value = true
		scheduleHide()
	}
}

function onPointerMove() {
	if (isH5) revealControls()
}

function onKeydown(event) {
	// #ifdef H5
	const target = event.target
	if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
	const code = event.code || event.key
	if (code === 'Space' || code === 'KeyK') {
		event.preventDefault()
		togglePlay()
	} else if (code === 'ArrowRight') {
		event.preventDefault()
		seekBy(10)
	} else if (code === 'ArrowLeft') {
		event.preventDefault()
		seekBy(-10)
	} else if (code === 'ArrowUp') {
		event.preventDefault()
		volume.value = clamp(volume.value + 0.08, 0, 1)
		if (videoEl) {
			videoEl.volume = volume.value
			videoEl.muted = false
			muted.value = false
		}
	} else if (code === 'ArrowDown') {
		event.preventDefault()
		volume.value = clamp(volume.value - 0.08, 0, 1)
		if (videoEl) videoEl.volume = volume.value
	} else if (code === 'KeyF') {
		event.preventDefault()
		toggleFullscreen()
	} else if (code === 'KeyM') {
		event.preventDefault()
		toggleMute()
	} else if (code === 'KeyN') {
		event.preventDefault()
		switchToNext()
	} else if (code === 'KeyP') {
		event.preventDefault()
		switchToPrev()
	} else if (code === 'Escape') {
		if (showPlaylist.value) showPlaylist.value = false
		else if (showSpeed.value) showSpeed.value = false
		else if (showMoreSheet.value) showMoreSheet.value = false
	}
	// #endif
}

function onAppPlay() {
	appPlaying.value = true
}

function onAppPause() {
	appPlaying.value = false
	syncAppProgressUi()
	saveCurrentProgress()
}

function syncAppProgressUi() {
	if (appPlaybackPosition !== null) position.value = appPlaybackPosition
	if (appPlaybackDuration) duration.value = appPlaybackDuration
}

function onAppTimeUpdate(event) {
	const now = Date.now()
	const detail = event?.detail || {}
	appPlaybackPosition = Number(detail.currentTime) || 0
	appPlaybackDuration = Number(detail.duration) || appPlaybackDuration || Number(current.value?.duration) || 0
	// 全屏进度由原生播放器绘制，无须不断刷新隐藏的 Vue 页面。
	if (!appFullscreen.value && now - lastAppUiUpdateAt >= 1000) {
		lastAppUiUpdateAt = now
		syncAppProgressUi()
	}
	appPlaying.value = true
	if (state.settings.rememberProgress && current.value && now - lastSaveAt > 10000) {
		lastSaveAt = now
		recordProgress(current.value, appPlaybackPosition, appPlaybackDuration)
	}
}

function onAppLoadedMetadata() {
	const video = current.value
	if (!video) return
	const resume = pendingAppSeek || getResumePosition(video)
	if (resume > 2 && (!duration.value || resume < duration.value - 2)) {
		if (!appContext) appContext = uni.createVideoContext('app-player', instance?.proxy)
		seekAppTo(resume)
		showResumeHint(resume)
	}
	pendingAppSeek = 0
	if (!appContext) appContext = uni.createVideoContext('app-player', instance?.proxy)
	setTimeout(() => appContext?.play(), 120)
}

function onAppEnded() {
	appPlaying.value = false
	saveCurrentProgress(true)
	if (state.settings.autoNext && nextVideo.value) {
		setTimeout(() => {
			if (nextVideo.value) playNext()
		}, 500)
	} else {
		showEndCard.value = true
	}
}

function onAppError(event) {
	appVideoError.value = true
	errorMessage.value = event?.detail?.errMsg || '系统播放器无法打开这个视频，可能是编码或权限问题。'
}

function goBack() {
	saveCurrentProgress()
	saveState({ immediate: true })
	// #ifdef H5
	if (document.fullscreenElement) {
		document.exitFullscreen?.()?.catch?.(() => {})
	}
	// #endif
	uni.navigateBack({
		delta: 1,
		fail: () => {
			uni.reLaunch({ url: '/pages/home/home' })
		}
	})
}

function queueProgress(item) {
	return progressPercent(item)
}

function cleanup() {
	if (isApp) {
		exitAppFullscreen()
		appAdjustments?.restoreBrightness()
		appAdjustments = null
		uni.offWindowResize(refreshAppControls)
		clearTimeout(appControlsTimer)
		appFullscreenControls?.close()
		appFullscreenControls = null
		try {
			plus.navigator.setFullscreen(false)
			plus.screen.lockOrientation('portrait-primary')
		} catch (error) { /* the native view may already have closed */ }
	}
	clearTimeout(hideTimer)
	clearTimeout(countdownTimer)
	clearTimeout(resumeTimer)
	clearTimeout(seekFeedbackTimer)
	// #ifdef H5
	window.removeEventListener('keydown', onKeydown)
	document.removeEventListener('fullscreenchange', onFullscreenChange)
	document.removeEventListener('visibilitychange', onVisibilityChange)
	window.removeEventListener('beforeunload', onBeforeUnload)
	if (videoEl) {
		videoEl.removeEventListener('loadedmetadata', onH5LoadedMetadata)
		videoEl.removeEventListener('timeupdate', onH5TimeUpdate)
		videoEl.removeEventListener('play', onH5Play)
		videoEl.removeEventListener('pause', onH5Pause)
		videoEl.removeEventListener('waiting', onH5Waiting)
		videoEl.removeEventListener('playing', onH5Playing)
		videoEl.removeEventListener('canplay', onH5CanPlay)
		videoEl.removeEventListener('ended', onH5Ended)
		videoEl.removeEventListener('error', onH5Error)
		videoEl.removeEventListener('progress', onH5Progress)
		videoEl.removeEventListener('volumechange', onH5VolumeChange)
	}
	// #endif
}
</script>

<style scoped>
/* ============================== shared ============================== */
.primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
	height: 38px;
	padding: 0 16px;
	border-radius: 10px;
	background: var(--accent);
	color: #0a0d0a;
	font-size: 12px;
	font-weight: 800;
}
.primary-btn:hover { background: #f1ff8c; }
.ghost-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	height: 38px;
	padding: 0 14px;
	border-radius: 10px;
	background: rgba(255, 255, 255, 0.08);
	color: var(--text);
	font-size: 12px;
	font-weight: 650;
	border: 1px solid rgba(255, 255, 255, 0.1);
}
.ghost-btn:hover { background: rgba(255, 255, 255, 0.13); }
.player-icon-btn {
	position: relative;
	width: 40px;
	height: 40px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.07);
	border: 1px solid rgba(255, 255, 255, 0.08);
	backdrop-filter: blur(10px);
}
.player-icon-btn:hover { background: rgba(255, 255, 255, 0.13); }
.queue-count {
	position: absolute;
	top: 1px;
	right: 0;
	min-width: 14px;
	height: 14px;
	padding: 0 3px;
	border-radius: 99px;
	background: var(--accent);
	color: #0a0d0a;
	font-size: 7.5px;
	font-weight: 850;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 1px solid #07080a;
}

/* ============================== H5 player ============================== */
.player-shell {
	position: fixed;
	inset: 0;
	width: 100vw;
	height: 100vh;
	background: #000;
	overflow: hidden;
	cursor: default;
}

.player-ambient {
	position: absolute;
	inset: -60px;
	z-index: 0;
	background-size: cover;
	background-position: center;
	filter: blur(42px) saturate(0.9) brightness(0.4);
	transform: scale(1.08);
	opacity: 0.72;
}
.player-ambient-mask {
	position: absolute;
	inset: 0;
	z-index: 0;
	background: radial-gradient(circle at 50% 45%, transparent 27%, rgba(0, 0, 0, 0.55) 100%);
	pointer-events: none;
}
.h5-video-host {
	position: absolute;
	inset: 0;
	z-index: 1;
	background: transparent;
}
.h5-video-host :deep(video),
.h5-video-host :deep(.h5-video) {
	width: 100%;
	height: 100%;
	display: block;
	object-fit: contain;
	background: transparent;
}
.player-shell.is-fill .h5-video-host :deep(video) { object-fit: fill; }
.fullscreen-fit-btn { padding: 8px 13px; border-radius: 18px; background: rgba(0, 0, 0, 0.45); color: #fff; font-size: 12px; cursor: pointer; }

.player-top-gradient {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 168px;
	z-index: 2;
	background: linear-gradient(180deg, rgba(0, 0, 0, 0.78), transparent);
	opacity: 0;
	transition: opacity 0.3s ease;
	pointer-events: none;
}
.player-bottom-gradient {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 230px;
	z-index: 2;
	background: linear-gradient(0deg, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.24) 58%, transparent);
	opacity: 0;
	transition: opacity 0.3s ease;
	pointer-events: none;
}
.player-top-gradient.is-visible,
.player-bottom-gradient.is-visible { opacity: 1; }

.player-loading {
	position: absolute;
	inset: 0;
	z-index: 6;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 14px;
	pointer-events: none;
	background: rgba(0, 0, 0, 0.16);
}
.loading-orbit { position: relative; width: 58px; height: 58px; display: flex; align-items: center; justify-content: center; }
.orbit-ring { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(232, 255, 99, 0.12); border-top-color: var(--accent); animation: spin 0.9s linear infinite; }
.loading-text { font-size: 11px; color: rgba(255, 255, 255, 0.62); letter-spacing: 0.08em; }

.player-error {
	position: absolute;
	inset: 0;
	z-index: 30;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 30px;
	background: radial-gradient(circle at 50% 40%, rgba(34, 30, 20, 0.6), rgba(0, 0, 0, 0.92));
}
.error-icon { width: 64px; height: 64px; border-radius: 20px; background: rgba(255, 196, 120, 0.08); border: 1px solid rgba(255, 196, 120, 0.16); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
.error-title { font-size: 20px; font-weight: 850; letter-spacing: -0.03em; }
.error-text { max-width: 460px; font-size: 12px; color: var(--muted); line-height: 1.7; margin-top: 7px; }
.error-actions { display: flex; gap: 9px; margin-top: 18px; flex-wrap: wrap; justify-content: center; }
.error-hint { max-width: 460px; font-size: 10px; color: #5f675e; margin-top: 18px; line-height: 1.6; }

.player-topbar {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	z-index: 20;
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: calc(var(--safe-top) + 14px) 22px 0;
	opacity: 0;
	transform: translateY(-6px);
	pointer-events: none;
	transition: opacity 0.26s ease, transform 0.26s ease;
}
.player-topbar.is-visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
.player-top-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.player-title-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.player-title { font-size: 16px; font-weight: 800; letter-spacing: -0.03em; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.3); }
.player-subtitle { display: flex; align-items: center; gap: 6px; font-size: 9.5px; color: rgba(255, 255, 255, 0.52); }
.player-folder { max-width: 130px; }
.auto-label { color: var(--accent); font-weight: 700; }
.auto-label.is-off { color: #8b938a; }
.player-top-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.center-controls {
	position: absolute;
	left: 50%;
	top: 50%;
	z-index: 18;
	display: flex;
	align-items: center;
	gap: 28px;
	transform: translate(-50%, -50%) scale(0.94);
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.22s ease, transform 0.22s ease;
}
.center-controls.is-visible { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }
.center-side {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	width: 56px;
	height: 56px;
	border-radius: 50%;
	justify-content: center;
	background: rgba(8, 10, 9, 0.34);
	border: 1px solid rgba(255, 255, 255, 0.11);
	backdrop-filter: blur(10px);
}
.center-side:hover { background: rgba(255, 255, 255, 0.12); }
.center-side-label { font-size: 7.5px; color: rgba(255, 255, 255, 0.62); }
.center-play {
	width: 74px;
	height: 74px;
	border-radius: 50%;
	background: var(--accent);
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.36), 0 0 0 8px rgba(232, 255, 99, 0.075);
}
.center-play:hover { background: #f1ff8c; transform: scale(1.03); }

.seek-feedback {
	position: absolute;
	left: 50%;
	top: 38%;
	z-index: 19;
	transform: translateX(-50%);
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 7px 11px;
	border-radius: 99px;
	background: rgba(6, 9, 8, 0.62);
	border: 1px solid rgba(232, 255, 99, 0.15);
	color: var(--accent);
	font-size: 10.5px;
	font-weight: 750;
	backdrop-filter: blur(12px);
	animation: hint-in 0.18s ease;
}
.resume-hint {
	position: absolute;
	left: 50%;
	bottom: 170px;
	z-index: 19;
	transform: translateX(-50%);
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 12px;
	border-radius: 99px;
	background: rgba(8, 11, 9, 0.72);
	border: 1px solid rgba(232, 255, 99, 0.16);
	color: #e9f5c8;
	font-size: 10.5px;
	font-weight: 650;
	backdrop-filter: blur(14px);
	animation: hint-in 0.22s ease;
}

.player-bottombar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 20;
	padding: 0 24px calc(var(--safe-bottom) + 18px);
	opacity: 0;
	transform: translateY(8px);
	pointer-events: none;
	transition: opacity 0.26s ease, transform 0.26s ease;
}
.player-bottombar.is-visible { opacity: 1; transform: translateY(0); pointer-events: auto; }

.progress-row { display: flex; align-items: center; gap: 11px; }
.time-text { width: 48px; font-size: 10px; color: rgba(255, 255, 255, 0.72); font-weight: 600; }
.time-text--right { text-align: right; }
.progress-slider-wrap { position: relative; flex: 1; height: 28px; display: flex; align-items: center; }
.buffer-track { position: absolute; left: 0; right: 0; top: 50%; height: 3px; margin-top: -1.5px; border-radius: 3px; background: rgba(255, 255, 255, 0.13); overflow: hidden; pointer-events: none; }
.buffer-fill { height: 100%; background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
.progress-slider { width: 100%; margin: 0; position: relative; z-index: 2; }
.progress-slider :deep(.uni-slider-container) { padding: 0; }
.progress-slider :deep(.uni-slider-handle) { box-shadow: 0 0 0 4px rgba(232, 255, 99, 0.16); }
.progress-slider :deep(.uni-slider-track) { height: 3px; border-radius: 3px; }

.control-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 1px; }
.control-left, .control-right { display: flex; align-items: center; gap: 5px; }
.control-btn {
	width: 38px;
	height: 38px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 0.18s ease;
}
.control-btn:hover { background: rgba(255, 255, 255, 0.09); }
.control-btn--play { width: 42px; height: 42px; border-radius: 50%; background: var(--accent); }
.control-btn--play:hover { background: #f1ff8c; }
.volume-wrap { display: flex; align-items: center; }
.volume-slider { width: 66px; margin-left: -5px; }
.volume-slider slider { width: 100%; }
.volume-slider :deep(.uni-slider-container) { padding: 0; }
.volume-slider :deep(.uni-slider-track) { height: 2px; }
.control-pill {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	height: 27px;
	padding: 0 9px;
	border-radius: 7px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	background: rgba(255, 255, 255, 0.055);
	font-size: 10px;
	font-weight: 650;
	color: rgba(255, 255, 255, 0.78);
}
.control-pill:hover { background: rgba(255, 255, 255, 0.1); }
.control-pill--auto { color: var(--accent); border-color: rgba(232, 255, 99, 0.15); background: rgba(232, 255, 99, 0.055); }
.control-pill--auto.is-off { color: #8b938a; border-color: rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.035); }
.auto-dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.keyboard-hint { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 7px; font-size: 8px; color: rgba(255, 255, 255, 0.28); letter-spacing: 0.02em; }
.keyboard-hint .dot { width: 2px; height: 2px; background: rgba(255, 255, 255, 0.22); }

.speed-popover {
	position: absolute;
	left: 84px;
	bottom: 92px;
	z-index: 25;
	padding: 10px;
	border-radius: 13px;
	background: rgba(14, 17, 15, 0.94);
	border: 1px solid rgba(255, 255, 255, 0.11);
	box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
	backdrop-filter: blur(22px);
	animation: hint-in 0.18s ease;
}
.speed-title { display: block; font-size: 8px; letter-spacing: 0.16em; color: var(--muted); font-weight: 750; text-transform: uppercase; margin: 1px 4px 7px; }
.speed-options { display: flex; gap: 4px; }
.speed-option { min-width: 37px; height: 27px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #b0b7ad; font-weight: 650; }
.speed-option:hover { background: rgba(255, 255, 255, 0.07); }
.speed-option.is-active { background: var(--accent); color: #0a0d0a; }

.up-next {
	position: absolute;
	right: 28px;
	bottom: 142px;
	z-index: 24;
	width: 292px;
	padding: 13px;
	border-radius: 15px;
	background: rgba(14, 17, 15, 0.86);
	border: 1px solid rgba(255, 255, 255, 0.11);
	box-shadow: 0 24px 60px rgba(0, 0, 0, 0.46);
	backdrop-filter: blur(24px);
	animation: up-next-in 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.up-next-label { display: flex; align-items: center; gap: 6px; font-size: 8.5px; letter-spacing: 0.1em; color: var(--accent); font-weight: 750; text-transform: uppercase; }
.up-next-count { margin-left: auto; width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(232, 255, 99, 0.3); display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--accent); }
.up-next-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.up-next-thumb { width: 72px; height: 41px; border-radius: 7px; overflow: hidden; flex-shrink: 0; background: #101513; }
.up-next-thumb image { width: 100%; height: 100%; }
.up-next-thumb-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #17302d, #0b100e); }
.up-next-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.up-next-title { font-size: 11.5px; font-weight: 750; color: #f2f4ef; }
.up-next-meta { font-size: 9px; color: var(--muted); }
.up-next-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
.up-next-cancel { height: 27px; padding: 0 10px; border-radius: 6px; display: flex; align-items: center; font-size: 10px; color: #9aa197; background: rgba(255, 255, 255, 0.05); }
.up-next-play { height: 27px; padding: 0 11px; border-radius: 6px; display: flex; align-items: center; font-size: 10px; font-weight: 750; color: #0a0d0a; background: var(--accent); }

/* end overlay */
.end-overlay { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(3, 5, 4, 0.76); backdrop-filter: blur(10px); animation: fade-in 0.28s ease; padding: 24px; }
.end-card { width: 100%; max-width: 460px; text-align: center; padding: 34px 26px; border-radius: 22px; background: rgba(17, 22, 19, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5); }
.end-kicker { font-size: 8px; letter-spacing: 0.28em; color: var(--accent); font-weight: 750; }
.end-title { display: block; font-size: 26px; font-weight: 900; letter-spacing: -0.04em; margin-top: 8px; }
.end-sub { display: block; font-size: 11px; color: var(--muted); margin-top: 7px; }
.end-actions { display: flex; justify-content: center; gap: 8px; margin-top: 22px; flex-wrap: wrap; }

/* drawer */
.drawer-layer { position: absolute; inset: 0; z-index: 50; background: rgba(2, 4, 3, 0.5); backdrop-filter: blur(5px); display: flex; justify-content: flex-end; animation: fade-in 0.2s ease; }
.playlist-drawer { width: min(390px, 92vw); height: 100%; background: #0e1210; border-left: 1px solid rgba(255, 255, 255, 0.09); display: flex; flex-direction: column; animation: drawer-in 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; padding: calc(var(--safe-top) + 22px) 20px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.drawer-title { display: block; font-size: 22px; font-weight: 850; letter-spacing: -0.04em; margin-top: 3px; }
.drawer-sub { display: block; font-size: 10px; color: var(--muted); margin-top: 2px; }
.queue-scroll { flex: 1; overflow-y: auto; padding: 8px 8px calc(24px + var(--safe-bottom)); }
.queue-item { display: flex; align-items: center; gap: 9px; padding: 8px; border-radius: 10px; cursor: pointer; }
.queue-item:hover { background: rgba(255, 255, 255, 0.04); }
.queue-item.is-current { background: rgba(232, 255, 99, 0.07); }
.queue-index { width: 20px; font-size: 9px; color: #5f675e; text-align: center; flex-shrink: 0; }
.queue-item.is-current .queue-index { color: var(--accent); }
.queue-thumb { position: relative; width: 74px; height: 42px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #111614; }
.queue-thumb image { width: 100%; height: 100%; }
.queue-thumb-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #18302d, #0a100e); }
.queue-playing { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.38); display: flex; align-items: center; justify-content: center; }
.queue-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.queue-title { font-size: 11px; font-weight: 700; color: #dce1d8; }
.queue-meta { display: flex; align-items: center; gap: 5px; font-size: 8.5px; color: var(--muted); }
.queue-progress { height: 2px; width: 72px; border-radius: 2px; background: rgba(255, 255, 255, 0.1); margin-top: 3px; overflow: hidden; }
.queue-progress view { height: 100%; background: var(--accent); }
.queue-now { font-size: 8px; color: var(--accent); flex-shrink: 0; font-weight: 750; }

/* details */
.details-list { display: flex; flex-direction: column; gap: 0; }
.details-view-mode { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); margin-bottom: 6px; cursor: pointer; }
.details-option-title { display: block; color: var(--text); font-size: 13px; font-weight: 650; }
.details-option-desc { display: block; color: var(--muted); font-size: 10px; margin-top: 3px; }
.details-toggle { width: 34px; height: 20px; padding: 3px; border-radius: 10px; background: #353b34; flex-shrink: 0; }
.details-toggle view { width: 14px; height: 14px; border-radius: 50%; background: #fff; }
.details-toggle.is-on { background: var(--accent); }
.details-toggle.is-on view { transform: translateX(14px); background: #0a0d0a; }
.detail-row { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 10px 2px; border-bottom: 1px solid rgba(255, 255, 255, 0.055); font-size: 11px; color: var(--muted); }
.detail-row:last-child { border-bottom: 0; }
.detail-value { color: var(--text-2); text-align: right; font-size: 11px; max-width: 62%; }
.details-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }

/* ============================== App player ============================== */
.app-player-page { min-height: 100vh; background: var(--bg); padding-bottom: calc(30px + var(--safe-bottom)); }
.app-player-page.is-fullscreen { position: fixed; inset: 0; width: 100vw; height: 100vh; padding: 0; overflow: hidden; background: #000; }
.app-player-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: calc(var(--safe-top) + 10px) 16px 10px;
	background: #07080a;
}
.app-header-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.app-header-title { font-size: 15px; font-weight: 750; letter-spacing: -0.02em; }
.app-header-sub { font-size: 9.5px; color: var(--muted); }
.app-video-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000; }
.app-video-stage.is-fullscreen { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; aspect-ratio: auto; z-index: 20; }
.app-video { width: 100%; height: 100%; background: #000; }
.app-video-error {
	position: absolute;
	inset: 0;
	z-index: 5;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 20px;
	background: rgba(5, 7, 6, 0.94);
}
.app-error-title { font-size: 15px; font-weight: 800; margin-top: 8px; }
.app-error-text { font-size: 10px; color: var(--muted); margin-top: 4px; max-width: 300px; line-height: 1.5; }
.app-error-actions { display: flex; gap: 7px; margin-top: 12px; }
.app-player-body { padding: 17px 16px 0; }
.app-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.app-title-copy { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.app-now-title { font-size: 22px; font-weight: 850; letter-spacing: -0.04em; line-height: 1.2; }
.app-meta-row { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; font-size: 9.5px; color: var(--muted); }
.app-auto-switch { display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border-radius: 7px; background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.08); color: #8c948a; font-size: 9px; font-weight: 650; flex-shrink: 0; }
.app-auto-switch.is-on { color: var(--accent); border-color: rgba(232, 255, 99, 0.16); background: rgba(232, 255, 99, 0.06); }
.app-auto-dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.app-progress-panel { margin-top: 16px; padding: 12px 13px; border-radius: 12px; background: rgba(255, 255, 255, 0.028); border: 1px solid rgba(255, 255, 255, 0.065); }
.app-progress-track { height: 3px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.app-progress-fill { height: 100%; background: var(--accent); border-radius: 3px; }
.app-progress-row { display: flex; justify-content: space-between; margin-top: 7px; font-size: 9px; color: var(--muted); }
.app-controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; }
.app-control-btn { flex: 1; height: 54px; border-radius: 12px; background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.07); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 8.5px; color: #a9b0a6; }
.app-control-btn--play { background: var(--accent); color: #0a0d0a; border-color: var(--accent); flex: 1.2; }
.app-speed-row { margin-top: 15px; display: flex; align-items: center; gap: 11px; }
.app-section-label { font-size: 9px; color: var(--muted); letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; flex-shrink: 0; }
.app-speed-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.app-speed-chip { height: 25px; padding: 0 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.06); display: flex; align-items: center; font-size: 9.5px; color: #939b90; }
.app-speed-chip.is-active { background: var(--accent); color: #0a0d0a; border-color: var(--accent); }
.app-adjustments { margin-top: 10px; padding: 6px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.025); }
.app-adjustment-row { display: flex; align-items: center; gap: 8px; min-height: 42px; }
.app-adjustment-label { font-size: 11px; color: #c2cbbf; }
.app-adjustment-slider { flex: 1; min-width: 0; margin: 0 6px; }
.app-adjustment-value { width: 32px; text-align: right; font-size: 10px; color: #c2cbbf; font-variant-numeric: tabular-nums; }
.app-next-hint { display: flex; align-items: center; gap: 6px; margin-top: 13px; font-size: 9.5px; color: #7e867c; line-height: 1.5; }
.app-queue { margin-top: 24px; }
.app-queue-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 9px; }
.app-queue-title { display: block; font-size: 18px; font-weight: 850; letter-spacing: -0.03em; margin-top: 2px; }
.app-queue-count { font-size: 9px; color: var(--muted); }
.app-queue-list { height: 324px; }
.app-queue-item { display: flex; align-items: center; gap: 9px; height: 50px; margin-bottom: 4px; padding: 7px; border-radius: 10px; box-sizing: border-box; }
.app-queue-item.is-current { background: rgba(232, 255, 99, 0.06); }
.app-queue-index { width: 18px; font-size: 8.5px; color: #5f675e; text-align: center; }
.app-queue-thumb { width: 64px; height: 36px; border-radius: 6px; overflow: hidden; background: #101513; flex-shrink: 0; }
.app-queue-thumb image { width: 100%; height: 100%; }
.app-queue-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #17302d, #0b100e); }
.app-queue-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.app-queue-item-title { font-size: 11px; font-weight: 700; }
.app-queue-item-meta { font-size: 8.5px; color: var(--muted); }
.app-player-footer { padding: 26px 0 4px; text-align: center; font-size: 8px; letter-spacing: 0.1em; color: #3d443e; }
.app-end-card { margin: 16px; padding: 22px; border-radius: 16px; background: rgba(232, 255, 99, 0.06); border: 1px solid rgba(232, 255, 99, 0.14); text-align: center; }
.app-end-icon { width: 42px; height: 42px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; }
.app-end-title { display: block; font-size: 17px; font-weight: 850; }
.app-end-sub { display: block; font-size: 10px; color: var(--muted); margin-top: 4px; }
.app-end-actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }

/* ============================== responsive ============================== */
@media (min-width: 900px) {
	.player-topbar { padding-left: 32px; padding-right: 32px; }
	.player-bottombar { padding-left: 34px; padding-right: 34px; }
	.player-title { font-size: 18px; }
	.center-controls { gap: 38px; }
	.center-play { width: 84px; height: 84px; }
	.up-next { right: 42px; bottom: 154px; }
	.keyboard-hint { justify-content: flex-end; padding-right: 2px; }
}

@media (max-width: 560px) {
	.player-topbar { padding-left: 14px; padding-right: 14px; }
	.player-bottombar { padding-left: 12px; padding-right: 12px; }
	.player-title { font-size: 14px; }
	.player-folder { display: none; }
	.folder-dot { display: none; }
	.volume-slider { display: none; }
	.control-pill--auto { display: none; }
	.keyboard-hint { display: none; }
	.time-text { width: 40px; font-size: 9px; }
	.center-controls { gap: 20px; }
	.center-side { width: 46px; height: 46px; }
	.center-play { width: 62px; height: 62px; }
	.control-left, .control-right { gap: 1px; }
	.control-btn { width: 34px; height: 34px; }
	.control-btn--play { width: 38px; height: 38px; }
	.control-pill { height: 24px; padding: 0 7px; font-size: 9px; }
	.up-next { left: 12px; right: 12px; bottom: 132px; width: auto; }
	.speed-popover { left: 12px; bottom: 88px; }
	.end-card { padding: 28px 18px; }
	.end-title { font-size: 23px; }
	.player-error { padding: 20px; }
}

@keyframes drawer-in { from { transform: translateX(30px); opacity: 0.4; } to { transform: translateX(0); opacity: 1; } }
@keyframes up-next-in { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes hint-in { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>
