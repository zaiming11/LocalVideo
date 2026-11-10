<template>
	<view class="home-page no-select" :class="{ 'is-folder-page': isFolderPage }" @touchstart="folderBackSwipe.start" @touchmove="folderBackSwipe.move" @touchend="folderBackSwipe.end" @touchcancel="folderBackSwipe.cancel">
		<view class="ambient ambient--one" />
		<view class="ambient ambient--two" />

		<!-- top bar -->
		<SubpageHeader v-if="isFolderPage" class="folder-page-header" :title="folderFilter" safe-area @back="closeFolder" />
		<view v-else-if="activeTab !== 'tvbox'" class="topbar safe-top">
			<view class="brand press" @click="scrollToTop">
				<view class="brand-mark">
					<image class="brand-image" src="/static/logo.png" mode="aspectFit" />
				</view>
				<view class="brand-copy">
					<text class="brand-title">本地影库</text>
					<text class="brand-sub">LOCAL CINEMA</text>
				</view>
			</view>
			<view class="top-actions">
				<view class="tvbox-entry" role="button" @click="openTVBox">TVBox</view>
				<view class="icon-button" @click="toggleSearch">
					<AppIcon name="search" :size="18" color="#E9EDE4" />
				</view>
				<view class="icon-button icon-button--accent" @click="openAddSheet">
					<AppIcon name="plus" :size="19" color="#0A0D0A" :stroke="2.2" />
				</view>
			</view>
		</view>

		<view class="home-content" :class="{ 'tvbox-home': activeTab === 'tvbox', 'tvbox-popup-open': tvboxPopupOpen }">
			<!-- preview notice -->
			<view v-if="showPreviewNotice && activeTab === 'library'" class="preview-notice">
				<view class="preview-icon"><AppIcon name="sparkles" :size="15" color="#E8FF63" /></view>
				<view class="preview-copy">
					<text class="preview-title">{{ previewNoticeTitle }}</text>
					<text class="preview-sub">{{ previewNoticeSub }}</text>
				</view>
				<view class="preview-close" @click="previewNoticeDismissed = true">
					<AppIcon name="x" :size="13" color="#8B9389" />
				</view>
			</view>

			<!-- library tab -->
			<TVBoxPanel v-if="activeTab === 'tvbox'" ref="tvboxPanel" @settings="switchTab('settings')" />
			<template v-else-if="activeTab === 'library'">
				<view v-if="!isFolderPage && featured" class="hero" @click="openFeatured">
					<image
						v-if="featured.thumb && !heroImageError"
						class="hero-image"
						:src="featured.thumb"
						mode="aspectFill"
						@error="heroImageError = true"
					/>
					<view v-else class="hero-fallback" :style="heroFallbackStyle">
						<view class="hero-orb" />
						<view class="hero-grid" />
					</view>
					<view class="hero-shade" />
					<view class="hero-grain" />

					<view class="hero-topline">
						<view class="hero-label">
							<view class="live-dot" />
							<text>{{ heroIsResume ? '继续观看' : '今日推荐' }}</text>
						</view>
						<view class="hero-quality">{{ extLabel(featured.ext) }} <text class="hero-sep">/</text> {{ featured.height ? `${featured.height}P` : '本地' }}</view>
					</view>

					<view class="hero-body">
						<text v-if="featured.latin" class="hero-latin">{{ featured.latin }}</text>
						<text class="hero-title">{{ featured.title }}</text>
						<text class="hero-sub">{{ heroSubtitle }}</text>

						<view v-if="heroPercent > 0" class="hero-progress-row">
							<view class="hero-progress-track">
								<view class="hero-progress-fill" :style="{ width: `${Math.min(100, heroPercent * 100)}%` }" />
							</view>
							<text class="hero-progress-text mono">{{ Math.round(heroPercent * 100) }}%</text>
						</view>

						<view class="hero-actions">
							<view class="primary-btn press" @click.stop="openFeatured">
								<AppIcon name="play" :size="15" color="#0A0D0A" />
								<text>{{ heroActionLabel }}</text>
							</view>
							<view class="ghost-btn press" @click.stop="openAddSheet">
								<AppIcon name="plus" :size="15" color="#E9EDE4" />
								<text>导入视频</text>
							</view>
						</view>
					</view>

					<view class="hero-play-ring" :style="heroRingStyle" @click.stop="openFeatured">
						<view class="hero-play-core">
							<AppIcon name="play" :size="20" color="#0A0D0A" />
						</view>
					</view>
				</view>

				<view v-else-if="!isFolderPage" class="empty-hero">
					<view class="empty-hero-glow" />
					<view class="empty-hero-icon"><AppIcon name="film" :size="28" color="#E8FF63" :stroke="1.5" /></view>
					<text class="empty-hero-kicker">YOUR PRIVATE SCREENING ROOM</text>
					<text class="empty-hero-title">{{ isDesktop ? '你的私人桌面影院' : '把影院装进口袋' }}</text>
					<text class="empty-hero-sub">{{ isDesktop ? '导入电脑里的视频文件夹，按文件名排序，随时接着上次的进度观看。' : '读取手机里的本地视频，按自己的方式排序、续播和收藏每一个夜晚。' }}</text>
					<view class="empty-hero-actions">
						<view class="primary-btn press" @click="handlePrimaryImport">
							<AppIcon name="folder" :size="15" color="#0A0D0A" />
							<text>从文件夹导入</text>
						</view>
						<view v-if="isH5" class="ghost-btn press" @click="loadDemoLibrary">
							<AppIcon name="sparkles" :size="15" color="#E9EDE4" />
							<text>载入示例</text>
						</view>
					</view>
				</view>

				<!-- stats -->
				<view v-if="!isFolderPage" class="stats-strip">
					<view class="stat-item">
						<view class="stat-icon"><AppIcon name="film" :size="15" color="#65E0C2" /></view>
						<view class="stat-copy">
							<text class="stat-value mono">{{ state.videos.length }}</text>
							<text class="stat-label">部影片</text>
						</view>
					</view>
					<view class="stat-divider" />
					<view class="stat-item">
						<view class="stat-icon"><AppIcon name="clock" :size="15" color="#FFC478" /></view>
						<view class="stat-copy">
							<text class="stat-value">{{ formatDurationLong(totalDuration) }}</text>
							<text class="stat-label">总时长</text>
						</view>
					</view>
					<view class="stat-divider" />
					<view class="stat-item">
						<view class="stat-icon"><AppIcon name="database" :size="15" color="#DDA7FF" /></view>
						<view class="stat-copy">
							<text class="stat-value">{{ formatBytes(totalSize) }}</text>
							<text class="stat-label">占用空间</text>
						</view>
					</view>
				</view>

				<!-- library -->
				<view id="library" class="library-block">
					<view class="section-head">
						<view class="section-title-wrap">
							<text class="section-kicker">LIBRARY</text>
							<view class="section-title-row">
								<text class="section-title">{{ isFolderPage ? folderFilter : '全部视频' }}</text>
								<text class="section-count mono">{{ filteredVideos.length }}</text>
							</view>
						</view>
						<view class="section-tools">
							<view class="tool-pill press" @click="toggleView">
								<AppIcon :name="state.settings.viewMode === 'grid' ? 'grid' : 'list'" :size="14" color="#C8CEC5" />
								<text class="tool-label">{{ state.settings.viewMode === 'grid' ? '网格' : '列表' }}</text>
							</view>
							<view class="tool-pill press" @click="showSortSheet = true">
								<AppIcon name="sort" :size="14" color="#C8CEC5" />
								<text class="tool-label">{{ sortLabel }}</text>
							</view>
						</view>
					</view>

					<view v-if="searchVisible" class="search-row">
						<view class="search-box">
							<AppIcon name="search" :size="16" color="#7C857B" />
							<input
								v-model="query"
								class="search-input"
								type="text"
								confirm-type="search"
								placeholder="搜索影片、文件夹或格式"
								placeholder-class="search-placeholder"
								:focus="searchVisible"
							/>
							<view v-if="query" class="search-clear" @click="query = ''">
								<AppIcon name="x" :size="12" color="#AAB1A8" />
							</view>
						</view>
						<view class="search-cancel press" @click="closeSearch">取消</view>
					</view>

					<view class="chip-row">
						<view
							class="filter-chip press"
							:class="{ 'is-active': formatFilter === 'all' && !folderFilter }"
							@click="resetFilters"
						>
							全部
						</view>
						<view
							class="filter-chip press"
							:class="{ 'is-active': formatFilter === 'unfinished' }"
							@click="setFormatFilter('unfinished')"
						>
							未看完
						</view>
						<view
							v-for="fmt in formatOptions"
							:key="fmt.key"
							class="filter-chip press"
							:class="{ 'is-active': formatFilter === fmt.key }"
							@click="setFormatFilter(fmt.key)"
						>
							{{ fmt.label }} <text class="chip-count">{{ fmt.count }}</text>
						</view>
						<view v-if="folderFilter" class="filter-chip is-active filter-chip--folder" @click="folderFilter = ''">
							<AppIcon name="folder" :size="12" color="#0A0D0A" />
							<text class="chip-folder-text">{{ folderFilter }}</text>
							<AppIcon name="x" :size="11" color="#0A0D0A" />
						</view>
					</view>

					<view v-if="state.videos.length === 0" class="empty-library">
						<view class="empty-illustration">
							<view class="film-strip">
								<view class="film-hole" v-for="n in 4" :key="`h1-${n}`" />
								<view class="film-frame"><AppIcon name="play" :size="22" color="#E8FF63" /></view>
								<view class="film-hole" v-for="n in 4" :key="`h2-${n}`" />
							</view>
						</view>
						<text class="empty-title">还没有本地视频</text>
						<text class="empty-sub">{{ isApp ? '选择视频文件夹，或通过右上角添加按钮手动扫描手机视频。' : '导入一个文件夹，或直接拖拽视频到窗口。' }}</text>
						<view class="primary-btn press" @click="handlePrimaryImport">
							<AppIcon name="folder" :size="15" color="#0A0D0A" />
							<text>选择视频文件夹</text>
						</view>
					</view>

					<view v-else-if="filteredVideos.length === 0" class="empty-library empty-library--small">
						<AppIcon name="search" :size="28" color="#59615A" />
						<text class="empty-title">没有匹配的视频</text>
						<text class="empty-sub">换个关键词或清除筛选条件再试试。</text>
						<view class="ghost-btn press" @click="clearAllFilters">
							<text>清除筛选</text>
						</view>
					</view>

					<view v-else class="video-grid" :class="{ 'is-list': state.settings.viewMode === 'list' }">
						<view
							v-for="(video, index) in filteredVideos"
							:key="video.id"
							class="card-slot"
							:style="{ animationDelay: `${Math.min(index, 10) * 30}ms` }"
						>
							<VideoCard
								:video="video"
								:variant="state.settings.viewMode"
								:progress="progressFor(video)"
								:current="state.currentId === video.id"
								@open="openVideo"
							/>
						</view>
					</view>
				</view>
			</template>

			<!-- folders tab -->
			<template v-else-if="activeTab === 'folders'">
				<view class="page-heading">
					<text class="section-kicker">COLLECTIONS</text>
					<text class="page-title">文件夹</text>
					<text class="page-sub">{{ folderGroups.length }} 个文件夹 · 按来源整理你的影片</text>
				</view>

				<view v-if="folderGroups.length" class="folder-grid">
					<view
						v-for="(folder, index) in folderGroups"
						:key="folder.name"
						class="folder-card press"
						:style="{ animationDelay: `${index * 40}ms` }"
						@click="openFolder(folder.name)"
					>
						<view class="folder-mosaic">
							<image
								v-for="(item, i) in folder.covers"
								:key="`${folder.name}-${i}`"
								class="mosaic-img"
								:src="item"
								mode="aspectFill"
							/>
							<view class="mosaic-shade" />
							<view class="folder-badge">
								<AppIcon name="folder" :size="15" color="#0A0D0A" />
								<text>{{ folder.items.length }}</text>
							</view>
							<view class="folder-play">
								<AppIcon name="play" :size="13" color="#0A0D0A" />
							</view>
						</view>
						<view class="folder-meta">
							<text class="folder-name clamp-1">{{ folder.name }}</text>
							<view class="folder-sub">
								<text>{{ formatBytes(folder.size) }}</text>
								<view class="dot" />
								<text>{{ formatDurationLong(folder.duration) }}</text>
							</view>
						</view>
					</view>
				</view>

				<view v-else class="empty-library">
					<view class="empty-hero-icon"><AppIcon name="folder" :size="28" color="#E8FF63" :stroke="1.5" /></view>
					<text class="empty-title">还没有文件夹</text>
						<text class="empty-sub">选择文件夹导入视频后，会按照目录自动归档。</text>
					<view class="primary-btn press" @click="handlePrimaryImport">
						<AppIcon name="folder" :size="15" color="#0A0D0A" />
						<text>从文件夹导入</text>
					</view>
				</view>
			</template>

			<!-- recent tab -->
			<template v-else-if="activeTab === 'recent'">
				<view class="page-heading page-heading--row">
					<view class="page-heading-copy">
						<text class="section-kicker">WATCH HISTORY</text>
						<text class="page-title">最近播放</text>
						<text class="page-sub">记录保存在本机，关闭应用后依然可以继续观看</text>
					</view>
					<view v-if="recentEntries.length" class="tool-pill press" @click="confirmClearHistory">
						<AppIcon name="trash" :size="13" color="#C8CEC5" />
						<text class="tool-label">清空</text>
					</view>
				</view>

				<view v-if="recentEntries.length" class="history-list">
					<view
						v-for="(entry, index) in recentEntries"
						:key="entry.id"
						class="history-item press"
						:style="{ animationDelay: `${index * 35}ms` }"
						@click="resumeEntry(entry)"
					>
						<view class="history-poster">
							<image v-if="entry.thumb" class="history-img" :src="entry.thumb" mode="aspectFill" />
							<view v-else class="history-fallback" :style="historyFallback(entry)">
								<AppIcon name="film" :size="22" :color="entry.accent || '#E8FF63'" :stroke="1.4" />
							</view>
							<view class="history-play">
								<AppIcon :name="entry.completed ? 'refresh' : 'play'" :size="13" color="#0A0D0A" />
							</view>
							<view v-if="entry.percent > 0" class="history-progress">
								<view class="history-progress-fill" :style="{ width: `${Math.min(100, entry.percent * 100)}%` }" />
							</view>
						</view>
						<view class="history-copy">
							<view class="history-top">
								<text class="history-title clamp-1">{{ entry.title }}</text>
								<text class="history-time">{{ entry.relative }}</text>
							</view>
							<text class="history-folder clamp-1">{{ entry.folder || '未分类' }}</text>
							<view class="history-bottom">
								<text class="history-status" :class="{ 'is-done': entry.completed }">
									{{ entry.completed ? '已看完' : `看到 ${formatDuration(entry.position)} / ${formatDuration(entry.duration)}` }}
								</text>
								<view class="history-resume">
									<text>{{ entry.completed ? '重新播放' : '继续' }}</text>
									<AppIcon name="arrow-right" :size="11" color="#E8FF63" />
								</view>
							</view>
						</view>
					</view>
				</view>

				<view v-else class="empty-library">
					<view class="empty-hero-icon"><AppIcon name="clock" :size="28" color="#E8FF63" :stroke="1.5" /></view>
					<text class="empty-title">还没有播放记录</text>
					<text class="empty-sub">看过的影片会自动出现在这里，并记住看到的位置。</text>
					<view class="primary-btn press" @click="activeTab = 'library'">
						<AppIcon name="film" :size="15" color="#0A0D0A" />
						<text>去媒体库看看</text>
					</view>
				</view>
			</template>

			<!-- settings tab -->
			<template v-else>
				<view class="page-heading">
					<text class="section-kicker">PREFERENCES</text>
					<text class="page-title">设置</text>
					<text class="page-sub">所有偏好与播放记录仅保存在这台设备</text>
				</view>

				<view class="settings-group">
					<text class="settings-group-label">在线片库</text>
                    <TVBoxPanel ref="tvboxSettingsPanel" mode="settings" @popup-change="tvboxPopupOpen = $event" />
                </view>
                <view class="settings-group">
                    <text class="settings-group-label">播放体验</text>
					<view class="settings-card">
						<view class="setting-row">
							<view class="setting-icon setting-icon--mint"><AppIcon name="playlist" :size="17" color="#65E0C2" /></view>
							<view class="setting-copy">
								<text class="setting-name">自动播放下一集</text>
								<text class="setting-desc">当前视频结束后，自动接续播放队列中的下一个</text>
							</view>
							<view class="switch" :class="{ 'is-on': state.settings.autoNext }" @click="toggleSetting('autoNext')">
								<view class="switch-thumb" />
							</view>
						</view>
						<view class="setting-divider" />
						<view class="setting-row">
							<view class="setting-icon setting-icon--amber"><AppIcon name="clock" :size="17" color="#FFC478" /></view>
							<view class="setting-copy">
								<text class="setting-name">记住播放进度</text>
								<text class="setting-desc">关闭应用后保留进度，下一次打开继续播放</text>
							</view>
							<view class="switch" :class="{ 'is-on': state.settings.rememberProgress }" @click="toggleSetting('rememberProgress')">
								<view class="switch-thumb" />
							</view>
						</view>
						<view class="setting-divider" />
						<view class="setting-row">
							<view class="setting-icon setting-icon--mint"><AppIcon name="maximize" :size="17" color="#65E0C2" /></view>
							<view class="setting-copy">
								<text class="setting-name">满屏观影</text>
								<text class="setting-desc">全屏时完整铺满，不裁切画面，比例可能变化</text>
							</view>
							<view class="switch" :class="{ 'is-on': state.settings.fullscreenFill }" @click="toggleSetting('fullscreenFill')">
								<view class="switch-thumb" />
							</view>
						</view>
						<view class="setting-divider" />
						<view class="setting-row setting-row--column">
							<view class="setting-row-main">
								<view class="setting-icon setting-icon--violet"><AppIcon name="gauge" :size="17" color="#DDA7FF" /></view>
								<view class="setting-copy">
									<text class="setting-name">默认播放速度</text>
									<text class="setting-desc">每次打开视频时使用的初始倍速</text>
								</view>
								<text class="setting-value mono">{{ state.settings.defaultRate.toFixed(2).replace(/\.?0+$/, '') }}×</text>
							</view>
							<view class="rate-row">
								<view
									v-for="rate in [0.5, 0.75, 1, 1.25, 1.5, 2]"
									:key="rate"
									class="rate-chip press"
									:class="{ 'is-active': state.settings.defaultRate === rate }"
									@click="state.settings.defaultRate = rate; setSetting('defaultRate', rate)"
								>
									{{ rate }}×
								</view>
							</view>
						</view>
					</view>
				</view>

				<view class="settings-group">
					<text class="settings-group-label">媒体库</text>
					<view class="settings-card">
						<view class="setting-row setting-row--tap" @click="openAddSheet">
							<view class="setting-icon setting-icon--accent"><AppIcon name="folder" :size="17" color="#0A0D0A" /></view>
							<view class="setting-copy">
								<text class="setting-name">导入本地视频</text>
								<text class="setting-desc">{{ isApp ? '选择文件夹或手动扫描手机视频' : '选择文件夹或多个视频文件' }}</text>
							</view>
							<AppIcon name="chevron-right" :size="16" color="#6C746B" />
						</view>
						<view class="setting-divider" />
						<view class="setting-row setting-row--tap" @click="openFormatGuide">
							<view class="setting-icon setting-icon--mint"><AppIcon name="shield" :size="17" color="#65E0C2" /></view>
							<view class="setting-copy">
								<text class="setting-name">格式与兼容性</text>
								<text class="setting-desc">了解支持的视频格式与系统播放器兜底</text>
							</view>
							<AppIcon name="chevron-right" :size="16" color="#6C746B" />
						</view>
						<view class="setting-divider" />
						<view class="setting-row setting-row--tap" @click="confirmClearLibrary">
							<view class="setting-icon setting-icon--danger"><AppIcon name="trash" :size="17" color="#FF9C9C" /></view>
							<view class="setting-copy">
								<text class="setting-name">清空媒体库</text>
								<text class="setting-desc">仅移除应用内的索引，不会删除手机中的原文件</text>
							</view>
							<AppIcon name="chevron-right" :size="16" color="#6C746B" />
						</view>
					</view>
				</view>

				<view class="settings-group">
					<text class="settings-group-label">关于</text>
					<AppUpdateSettings />
					<view class="settings-card">
						<view class="about-block">
							<view class="about-mark"><AppIcon name="logo" :size="42" color="#E8FF63" /></view>
							<view class="about-copy">
								<text class="about-name">本地影库 <text class="about-version">v{{ updateState.currentVersion }}</text></text>
								<text class="about-desc">为本地视频而生的轻量播放器。不上传、不分析、不打扰。</text>
								<view class="about-tags">
									<text>uni-app</text>
									<text>Vue 3</text>
									<text>Android MediaStore</text>
								</view>
							</view>
						</view>
						<view class="setting-divider" />
						<view class="about-note">
							<AppIcon name="shield" :size="14" color="#65E0C2" />
							<text>播放记录仅写入本机存储，卸载应用后自动清除。</text>
						</view>
					</view>
				</view>

				<view class="settings-footer">
					<text>LOCAL CINEMA · MADE FOR YOUR OWN SCREEN</text>
				</view>
			</template>
		</view>

		<!-- bottom dock -->
		<view class="dock-wrap">
			<view class="dock glass">
				<view
					v-for="tab in tabs"
					:key="tab.key"
					class="dock-item press"
					:class="{ 'is-active': activeTab === tab.key }"
					@click="switchTab(tab.key)"
				>
					<AppIcon :name="tab.icon" :size="19" :color="activeTab === tab.key ? '#0A0D0A' : '#A9B0A7'" :stroke="1.7" />
					<text class="dock-label">{{ tab.label }}</text>
					<view v-if="tab.key === 'recent' && recentEntries.length" class="dock-badge">{{ Math.min(9, recentEntries.length) }}</view>
				</view>
			</view>
		</view>

		<!-- sort sheet -->
		<BottomSheet
			:visible="showSortSheet"
			title="排序方式"
			kicker="SORT LIBRARY"
			subtitle="排序会立即生效，并记住你的选择"
			@close="showSortSheet = false"
		>
			<view class="sort-list">
				<view
					v-for="option in sortOptions"
					:key="option.key"
					class="sort-option press"
					:class="{ 'is-active': state.settings.sortKey === option.key }"
					@click="setSort(option.key)"
				>
					<view class="sort-icon"><AppIcon :name="option.icon" :size="17" :color="state.settings.sortKey === option.key ? '#0A0D0A' : '#AAB1A8'" /></view>
					<view class="sort-copy">
						<text class="sort-name">{{ option.label }}</text>
						<text class="sort-desc">{{ option.desc }}</text>
					</view>
					<view class="radio" :class="{ 'is-on': state.settings.sortKey === option.key }">
						<view class="radio-core" />
					</view>
				</view>
			</view>
			<view class="direction-row">
				<view class="direction-label">
					<text class="setting-name">排序方向</text>
					<text class="setting-desc">{{ sortDirectionHint }}</text>
				</view>
				<view class="segmented">
					<view class="segment press" :class="{ 'is-on': state.settings.sortDir === 'desc' }" @click="setSortDirection('desc')">降序</view>
					<view class="segment press" :class="{ 'is-on': state.settings.sortDir === 'asc' }" @click="setSortDirection('asc')">升序</view>
				</view>
			</view>
		</BottomSheet>

		<!-- add / import sheet -->
		<BottomSheet
			:visible="showAddSheet"
			title="添加视频"
			kicker="ADD TO LIBRARY"
			:subtitle="isApp ? '选择文件夹或手动扫描，视频保留在原位置' : '浏览器会直接读取你选择的本地文件，不会上传'"
			@close="showAddSheet = false"
		>
			<view class="add-options">
				<view class="add-option press is-primary" @click="handlePrimaryImport">
					<view class="add-icon"><AppIcon name="folder" :size="21" color="#0A0D0A" /></view>
					<view class="add-copy">
						<text class="add-title">从文件夹导入</text>
						<text class="add-desc">支持子文件夹，推荐一次导入整季影片</text>
					</view>
					<AppIcon name="arrow-right" :size="17" color="#0A0D0A" />
				</view>

				<view v-if="isApp" class="add-option press" @click="handleAndroidScan">
					<view class="add-icon"><AppIcon name="phone" :size="21" color="#E8FF63" /></view>
					<view class="add-copy">
						<text class="add-title">扫描手机视频</text>
						<text class="add-desc">手动读取相册与媒体库中的全部视频</text>
					</view>
					<AppIcon name="chevron-right" :size="17" color="#6C746B" />
				</view>

				<view v-if="isH5" class="add-option press" @click="handleImportFiles">
					<view class="add-icon"><AppIcon name="film" :size="21" color="#E8FF63" /></view>
					<view class="add-copy">
						<text class="add-title">选择视频文件</text>
						<text class="add-desc">可多选，常见的 MP4 / MKV / MOV / AVI 等</text>
					</view>
					<AppIcon name="chevron-right" :size="17" color="#6C746B" />
				</view>

				<view v-if="isH5 && !isDesktop" class="add-option press" @click="loadPreviewLibraryFromSheet">
					<view class="add-icon"><AppIcon name="film" :size="21" color="#65E0C2" /></view>
					<view class="add-copy">
						<text class="add-title">载入汪汪队第 1 季预览</text>
						<text class="add-desc">26 集 4K 本地剧集，通过本机预览服务挂载</text>
					</view>
					<AppIcon name="chevron-right" :size="17" color="#6C746B" />
				</view>

				<view v-if="isH5 && !previewVideos.length" class="add-option press" @click="loadDemoLibraryFromSheet">
					<view class="add-icon"><AppIcon name="sparkles" :size="21" color="#DDA7FF" /></view>
					<view class="add-copy">
						<text class="add-title">载入示例片库</text>
						<text class="add-desc">4 段本地 H.264 示例视频，用于验证连播与续播</text>
					</view>
					<AppIcon name="chevron-right" :size="17" color="#6C746B" />
				</view>

				<view v-if="isApp" class="permission-note">
					<AppIcon name="shield" :size="15" color="#65E0C2" />
					<text>文件夹导入仅访问你选择的目录；扫描手机视频需要视频访问权限。</text>
				</view>
			</view>
		</BottomSheet>

		<!-- format guide -->
		<BottomSheet
			:visible="showFormatGuide"
			title="格式与兼容性"
			kicker="PLAYBACK ENGINE"
			subtitle="本地文件始终留在你的设备上"
			@close="showFormatGuide = false"
		>
			<view class="format-guide">
				<view class="guide-section">
					<text class="guide-title">浏览器预览</text>
					<text class="guide-text">H5 播放能力由浏览器编解码器决定。MP4(H.264) 与 WebM 支持最好，MKV / AVI / FLV 等格式通常无法在浏览器中直接播放；导入后会显示格式徽标。</text>
				</view>
				<view class="guide-section">
					<text class="guide-title">Android App</text>
					<text class="guide-text">打包后使用系统原生播放器，支持绝大多数 Android 设备常见的 MP4、MKV、WebM、MOV、TS、3GP 等格式，并保留硬件解码与全屏能力。对于极少数系统不支持的编码，可在播放器中调用“系统播放器”兜底打开。</text>
				</view>
				<view class="format-tags">
					<text class="format-tag">MP4</text>
					<text class="format-tag">MKV</text>
					<text class="format-tag">MOV</text>
					<text class="format-tag">WEBM</text>
					<text class="format-tag">AVI</text>
					<text class="format-tag">FLV</text>
					<text class="format-tag">TS</text>
					<text class="format-tag">3GP</text>
					<text class="format-tag">WMV</text>
					<text class="format-tag">RMVB</text>
				</view>
				<view class="guide-tip">
					<AppIcon name="info" :size="15" color="#E8FF63" />
					<text>“兼容大部分格式”依赖手机厂商的系统解码器；播放失败时建议使用系统播放器或转换为 H.264 MP4。</text>
				</view>
			</view>
		</BottomSheet>

		<!-- scanning overlay -->
		<view v-if="state.scanning" class="scan-overlay">
			<view class="scan-card">
				<view class="scan-spinner">
					<view class="scan-ring" />
					<AppIcon name="film" :size="22" color="#E8FF63" />
				</view>
				<text class="scan-title">{{ state.scanLabel }}</text>
				<view class="scan-bar"><view class="scan-bar-fill" :style="{ width: `${Math.max(4, state.scanProgress)}%` }" /></view>
				<text class="scan-percent mono">{{ Math.round(state.scanProgress) }}%</text>
				<text class="scan-note">{{ isApp ? '正在读取本地视频…' : '正在读取视频元数据并生成缩略图…' }}</text>
			</view>
		</view>

		<!-- drag & drop -->
		<view v-if="dragActive" class="drop-overlay">
			<view class="drop-card">
				<AppIcon name="upload" :size="30" color="#E8FF63" />
				<text class="drop-title">松开以导入视频</text>
				<text class="drop-sub">视频只在本地浏览器中读取</text>
			</view>
		</view>

		<AppToast />
	</view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onShow, onLoad, onBackPress } from '@dcloudio/uni-app'
import TVBoxPanel from '../../components/TVBoxPanel.vue'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { createSwipeBack } from '../../core/swipe-back.mjs'
import AppUpdateSettings from '../../components/AppUpdateSettings.vue'
import { updateState } from '../../core/update/client.js'
import AppIcon from '../../components/AppIcon.vue'
import AppToast from '../../components/AppToast.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import VideoCard from '../../components/VideoCard.vue'
import {
	addVideos,
	clearLibrary,
	getVideoById,
	initStore,
	progressPercent,
	saveState,
	seedDemoLibrary,
	seedPreviewLibrary,
	setCurrent,
	setLastTab,
	setQueueForVideo,
	setSetting,
	showToast,
	state,
	useVideoStore,
	updateScanProgress,
	setScanning
} from '../../core/store.js'
import {
	extLabel,
	formatBytes,
	formatDuration,
	formatDurationLong,
	isApp as detectApp,
	isH5 as detectH5,
	paletteFor,
	relativeTime
} from '../../core/utils.js'
import {
	browserSupportsDirectoryPicker,
	filesFromDropEvent,
	importBrowserVideos,
	openAndroidPermissionSettings,
	pickBrowserDirectory,
	pickBrowserFiles,
	scanAndroidVideos
} from '../../core/media.js'
import { pickAndroidDirectory, readAndroidDirectory } from '../../core/android-directory.js'

initStore()
const { sortedVideos, totalDuration, totalSize, continueInfo } = useVideoStore()

const isH5 = detectH5()
function openTVBox() { switchTab('tvbox') }
const isApp = detectApp()
const isDesktop = typeof window !== 'undefined' && !!window.localVideoDesktop
if (isH5 && !isDesktop) {
	const previewLoaded = seedPreviewLibrary()
	if (!previewLoaded) seedDemoLibrary()
}
const tabs = [
	{ key: 'tvbox', label: 'TVBox', icon: 'film' },
	{ key: 'library', label: '媒体库', icon: 'grid' },
	{ key: 'folders', label: '文件夹', icon: 'folder' },
	{ key: 'recent', label: '最近', icon: 'clock' },
	{ key: 'settings', label: '设置', icon: 'settings' }
]
const validTabs = tabs.map((item) => item.key)
const activeTab = ref('tvbox')
const tvboxPopupOpen = ref(false)
onLoad(options => { if ([...validTabs, 'library'].includes(options?.tab)) activeTab.value = options.tab })
const query = ref('')
const searchVisible = ref(false)
const formatFilter = ref('all')
const folderFilter = ref('')
const tvboxPanel = ref(null)
const tvboxSettingsPanel = ref(null)
const isFolderPage = computed(() => activeTab.value === 'library' && !!folderFilter.value)
const folderBackSwipe = createSwipeBack({ canGoBack: () => isFolderPage.value && !showSortSheet.value && !showAddSheet.value && !showFormatGuide.value, onBack: closeFolder })
function closeFolder() {
	if (!isFolderPage.value) return false
	folderFilter.value = ''; activeTab.value = 'folders'; searchVisible.value = false
	uni.pageScrollTo({ scrollTop: 0, duration: 180 })
	return true
}
onBackPress(() => {
	for (const sheet of [showSortSheet, showAddSheet, showFormatGuide]) {
		if (sheet.value) { sheet.value = false; return true }
	}
	if (activeTab.value === 'tvbox' && tvboxPanel.value?.handleBack()) return true
	if (activeTab.value === 'settings' && tvboxSettingsPanel.value?.handleBack()) return true
	return closeFolder()
})
const showSortSheet = ref(false)
const showAddSheet = ref(false)
const showFormatGuide = ref(false)
const previewNoticeDismissed = ref(false)
const dragActive = ref(false)
const heroImageError = ref(false)

const sortOptions = [
	{ key: 'date', label: '添加时间', desc: '按视频加入媒体库的时间排序', icon: 'clock' },
	{ key: 'name', label: '文件名', desc: '按文件名自然排序，数字更符合直觉', icon: 'list' },
	{ key: 'duration', label: '视频时长', desc: '快速找到短片或长片', icon: 'gauge' },
	{ key: 'size', label: '文件大小', desc: '按占用空间从大到小', icon: 'database' }
]

const sortLabel = computed(() => {
	const item = sortOptions.find((option) => option.key === state.settings.sortKey)
	return item ? item.label : '添加时间'
})

const sortDirectionHint = computed(() => {
	if (state.settings.sortKey === 'name') {
		return state.settings.sortDir === 'asc' ? '按名称 A → Z' : '按名称 Z → A'
	}
	return state.settings.sortDir === 'desc' ? '数值从大到小 / 最新在前' : '数值从小到大 / 最早在前'
})

const formatOptions = computed(() => {
	const counts = {}
	for (const video of sortedVideos.value) {
		const key = video.ext || 'video'
		counts[key] = (counts[key] || 0) + 1
	}
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4)
		.map(([key, count]) => ({ key: `ext:${key}`, label: extLabel(key), count }))
})

const filteredVideos = computed(() => {
	const keyword = query.value.trim().toLowerCase()
	let list = sortedVideos.value
	if (keyword) {
		list = list.filter((video) =>
			`${video.title} ${video.name} ${video.folder} ${video.ext}`.toLowerCase().includes(keyword)
		)
	}
	if (folderFilter.value) {
		list = list.filter((video) => video.folder === folderFilter.value)
	}
	if (formatFilter.value === 'unfinished') {
		list = list.filter((video) => {
			const percent = progressFor(video)
			return percent > 0 && percent < 0.97
		})
	} else if (formatFilter.value.startsWith('ext:')) {
		const ext = formatFilter.value.slice(4)
		list = list.filter((video) => video.ext === ext)
	}
	return list
})

const folderGroups = computed(() => {
	const map = new Map()
	for (const video of sortedVideos.value) {
		const name = video.folder || '未分类'
		if (!map.has(name)) {
			map.set(name, { name, items: [], size: 0, duration: 0, covers: [], latest: 0 })
		}
		const group = map.get(name)
		group.items.push(video)
		group.size += Number(video.size) || 0
		group.duration += Number(video.duration) || 0
		group.latest = Math.max(group.latest, video.addedAt || video.modified || 0)
		if (video.thumb) group.covers.push(video.thumb)
	}
	return Array.from(map.values())
		.map((group) => ({
			...group,
			covers: group.covers.slice(0, 3)
		}))
		.sort((a, b) => b.latest - a.latest)
})

const recentEntries = computed(() => {
	const source = state.history.length ? state.history : Object.values(state.progress)
	const seen = new Set()
	const list = []
	for (const entry of source) {
		if (!entry || seen.has(entry.id)) continue
		seen.add(entry.id)
		const video = getVideoById(entry.id)
		const duration = Number(entry.duration) || Number(video?.duration) || 0
		const position = Number(entry.position) || 0
		const percent = duration > 0 ? Math.min(1, position / duration) : Number(entry.percent) || 0
		list.push({
			...entry,
			video: video || null,
			duration,
			position,
			percent: entry.completed ? 1 : percent,
			thumb: video?.thumb || entry.thumb || '',
			folder: video?.folder || entry.folder || '未分类',
			accent: video?.accent || paletteFor(entry.id).accent,
			from: video?.from || paletteFor(entry.id).from,
			to: video?.to || paletteFor(entry.id).to,
			relative: relativeTime(entry.updatedAt)
		})
	}
	return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
})

const featured = computed(() => {
	const info = continueInfo.value
	if (info?.video) return info.video
	if (info?.entry) {
		const entry = info.entry
		return {
			id: entry.id,
			title: entry.title,
			name: entry.name,
			folder: entry.folder,
			thumb: entry.thumb || '',
			duration: entry.duration,
			position: entry.position,
			ext: '',
			height: 0,
			latin: '',
			description: '',
			demo: !!entry.demo,
			url: '',
			from: paletteFor(entry.id).from,
			to: paletteFor(entry.id).to,
			accent: paletteFor(entry.id).accent,
			unavailable: true
		}
	}
	return sortedVideos.value[0] || null
})

const heroIsResume = computed(() => Boolean(
	continueInfo.value?.entry &&
	!continueInfo.value.completed &&
	Number(continueInfo.value.percent) > 0.02
))
const heroPercent = computed(() => {
	if (!featured.value) return 0
	if (continueInfo.value?.entry?.id === featured.value.id) {
		return Number(continueInfo.value.percent) || 0
	}
	return progressFor(featured.value)
})
const heroActionLabel = computed(() => {
	if (featured.value?.unavailable) return '重新导入'
	return heroIsResume.value ? '继续播放' : '开始播放'
})
const heroSubtitle = computed(() => {
	const video = featured.value
	if (!video) return ''
	if (video.description) return video.description
	if (video.unavailable) return '播放记录仍在，但原文件暂时不在媒体库中。重新扫描或导入后即可继续。'
	const progress = progressFor(video)
	if (progress > 0 && progress < 0.97) {
		const entry = state.progress[video.id]
		return `上次看到 ${formatDuration(entry?.position)}，已观看 ${Math.round(progress * 100)}%。`
	}
	return video.series || `来自「${video.folder || '未分类'}」的本地视频`
})
const heroFallbackStyle = computed(() => {
	const video = featured.value
	if (!video) return { background: 'linear-gradient(135deg, #1b2b2a, #080b0c)' }
	return {
		background: `linear-gradient(135deg, ${video.from || '#1b2b2a'} 0%, ${video.to || '#060809'} 100%)`
	}
})
const heroRingStyle = computed(() => {
	const percent = Math.max(0, Math.min(1, heroPercent.value))
	return {
		background: `conic-gradient(var(--accent) ${percent * 360}deg, rgba(255,255,255,0.14) 0)`
	}
})
const previewVideos = computed(() => state.videos.filter((video) => video.preview))
const showPreviewNotice = computed(() =>
	isH5 && !isDesktop &&
	!previewNoticeDismissed.value &&
	(state.videos.some((video) => video.demo) || previewVideos.value.length > 0)
)
const previewNoticeTitle = computed(() =>
	previewVideos.value.length
		? '浏览器预览 · 已挂载本地剧集'
		: '浏览器预览模式'
)
const previewNoticeSub = computed(() =>
	previewVideos.value.length
		? `已读取《汪汪队立大功》第 1 季 ${previewVideos.value.length} 集 4K 原文件，不复制、不上传。播放进度会保存在本机。`
		: '已载入 4 个示例视频。点击右上角 + 可导入电脑上的本地视频。'
)

watch(activeTab, (tab) => {
	setLastTab(tab)
	searchVisible.value = false
	if (tab === 'library') {
		setTimeout(() => {
			// keep the layout stable when the keyboard closes on mobile
			query.value = query.value
		}, 50)
	}
})

watch(folderFilter, () => {
	if (folderFilter.value) {
		formatFilter.value = 'all'
	}
})

watch(() => featured.value?.id, () => {
	heroImageError.value = false
})

onMounted(() => {
	if (isH5) {
		window.addEventListener('dragover', onDragOver)
		window.addEventListener('dragleave', onDragLeave)
		window.addEventListener('drop', onDrop)
	}
})

onShow(() => {
	initStore()
})

onBeforeUnmount(() => {
	if (isH5) {
		window.removeEventListener('dragover', onDragOver)
		window.removeEventListener('dragleave', onDragLeave)
		window.removeEventListener('drop', onDrop)
	}
})

function progressFor(video) {
	return progressPercent(video)
}

function historyFallback(entry) {
	return {
		background: `linear-gradient(135deg, ${entry.from || '#183230'}, ${entry.to || '#080b0c'})`
	}
}

function toggleSearch() {
	searchVisible.value = !searchVisible.value
	if (!searchVisible.value) query.value = ''
}

function closeSearch() {
	searchVisible.value = false
	query.value = ''
}

function resetFilters() {
	formatFilter.value = 'all'
	folderFilter.value = ''
}

function clearAllFilters() {
	query.value = ''
	formatFilter.value = 'all'
	folderFilter.value = ''
}

function setFormatFilter(key) {
	formatFilter.value = formatFilter.value === key ? 'all' : key
	folderFilter.value = ''
}

function toggleView() {
	setSetting('viewMode', state.settings.viewMode === 'grid' ? 'list' : 'grid')
}

function setSort(key) {
	setSetting('sortKey', key)
}

function setSortDirection(dir) {
	setSetting('sortDir', dir)
}

function switchTab(tab) {
	if (isFolderPage.value) folderFilter.value = ''
	activeTab.value = tab
	if (tab !== 'library') {
		searchVisible.value = false
	}
	uni.pageScrollTo({ scrollTop: 0, duration: 220 })
}

function scrollToTop() {
	uni.pageScrollTo({ scrollTop: 0, duration: 260 })
}

function toggleSetting(key) {
	setSetting(key, !state.settings[key])
}

function openAddSheet() {
	showAddSheet.value = true
}

function openFormatGuide() {
	showFormatGuide.value = true
}

function loadDemoLibrary() {
	const seeded = seedDemoLibrary()
	if (seeded) {
		showToast('已载入 4 个示例视频', 'success')
	} else {
		showToast('示例片库已在媒体库中')
	}
}

function loadPreviewLibraryFromSheet() {
	showAddSheet.value = false
	const loaded = seedPreviewLibrary(true)
	if (loaded || state.videos.some((video) => video.preview)) {
		showToast('已载入汪汪队第 1 季 26 集', 'success', 2400)
		if (activeTab.value !== 'library') activeTab.value = 'library'
	} else {
		showToast('预览片库不可用，请确认本地预览服务已启动', 'error')
	}
}

function loadDemoLibraryFromSheet() {
	showAddSheet.value = false
	if (state.videos.some((video) => video.demo)) {
		showToast('示例片库已在媒体库中')
		return
	}
	state.demoDismissed = false
	state.demoSeeded = false
	const seeded = seedDemoLibrary()
	showToast(seeded ? '已重新载入示例片库' : '示例片库加载失败', seeded ? 'success' : 'error')
}

function openFolder(name) {
	folderFilter.value = name
	formatFilter.value = 'all'
	activeTab.value = 'library'
	setTimeout(() => {
		uni.pageScrollTo({ scrollTop: 0, duration: 180 })
	}, 120)
}

function openVideo(video) {
	if (!video || !video.url) {
		showAddSheet.value = true
		showToast('原文件已不在媒体库，请重新导入', 'error')
		return
	}
	const queue = filteredVideos.value.length ? filteredVideos.value : sortedVideos.value
	setQueueForVideo(video, queue)
	setCurrent(video.id)
	uni.navigateTo({
		url: `/pages/player/player?id=${encodeURIComponent(video.id)}`
	})
}

function openFeatured() {
	const video = featured.value
	if (!video) {
		openAddSheet()
		return
	}
	if (video.unavailable || !video.url) {
		openAddSheet()
		return
	}
	openVideo(video)
}

function resumeEntry(entry) {
	if (!entry.video || !entry.video.url) {
		if (String(entry.id).startsWith('tvbox_') || entry.video?.source === 'tvbox') {
			showToast('这条旧记录缺少播放信息，请从 TVBox 重新打开影片', 'error')
			return
		}
		showToast('原文件已不在媒体库，请重新导入', 'error')
		openAddSheet()
		return
	}
	openVideo(entry.video)
}

async function handlePrimaryImport() {
	showAddSheet.value = false
	if (isApp) {
		await importFromAndroidDirectory()
		return
	}
	if (browserSupportsDirectoryPicker()) {
		await importFromDirectory()
	} else {
		await handleImportFiles()
	}
}

function handleAndroidScan() {
	showAddSheet.value = false
	if (!state.scanning) runAndroidScan()
}

async function importFromAndroidDirectory() {
	if (state.scanning) return
	try {
		const selection = await pickAndroidDirectory()
		if (!selection) return
		setScanning(true, '正在查找文件夹中的视频…', 4)
		const videos = await readAndroidDirectory(selection, (percent, done, total) => {
			updateScanProgress(percent, total ? `正在读取 ${done} / ${total} 个视频…` : `已找到 ${done} 个视频…`)
		})
		setScanning(false)
		if (!videos.length) {
			showToast('这个文件夹里没有找到视频')
			return
		}
		addVideos(videos, { replaceDemos: true })
		resetFilters()
		activeTab.value = 'library'
		showToast(`已从文件夹导入 ${videos.length} 个视频`, 'success', 2600)
	} catch (error) {
		setScanning(false)
		console.error('[LocalCinema] folder import failed', error?.code, error?.message)
		showToast(error?.message || '文件夹导入失败', 'error')
	}
}

async function importFromDirectory() {
	showAddSheet.value = false
	let entries = []
	try {
		setScanning(true, '选择包含视频的文件夹…', 3)
		entries = await pickBrowserDirectory()
	} catch (e) {
		setScanning(false)
		if (e?.name === 'AbortError') return
		if (e?.code === 'UNSUPPORTED') {
			showToast('当前浏览器不支持文件夹选择，请改用文件选择', 'error')
			await handleImportFiles()
			return
		}
		showToast(e?.message || '无法读取文件夹', 'error')
		return
	}
	if (!entries.length) {
		setScanning(false)
		showToast('这个文件夹里没有找到视频')
		return
	}
	await ingestBrowserEntries(entries)
}

async function handleImportFiles() {
	showAddSheet.value = false
	let files = []
	try {
		files = await pickBrowserFiles()
	} catch (e) {
		showToast('无法打开文件选择器', 'error')
		return
	}
	if (!files.length) return
	await ingestBrowserEntries(files.map((file) => ({ file, folder: '本机导入' })))
}

async function ingestBrowserEntries(entries) {
	setScanning(true, `正在读取 ${entries.length} 个视频…`, 5)
	try {
		const imported = await importBrowserVideos(entries, {
			onProgress: (percent, done, total) => {
				updateScanProgress(Math.max(5, percent), `正在解析 ${done} / ${total} 个视频…`)
			}
		})
		if (!imported.length) {
			setScanning(false)
			showToast('没有读取到可播放的视频', 'error')
			return
		}
		addVideos(imported, { replaceDemos: true })
		setScanning(false)
		showToast(`已导入 ${imported.length} 个本地视频`, 'success', 2600)
		if (activeTab.value !== 'library') activeTab.value = 'library'
	} catch (e) {
		setScanning(false)
		showToast(e?.message || '读取视频失败', 'error')
	}
}

async function runAndroidScan() {
	if (!isApp) return
	setScanning(true, '正在扫描手机视频…', 4)
	try {
		const list = await scanAndroidVideos((percent, done, total) => {
			updateScanProgress(Math.max(4, percent), `正在整理 ${done} / ${total} 个视频…`)
		})
		addVideos(list)
		setScanning(false)
		showToast(list.length ? `已找到 ${list.length} 个本地视频` : '没有找到本地视频', list.length ? 'success' : 'default', 2500)
	} catch (e) {
		setScanning(false)
		if (e?.code === 'PERMISSION_DENIED_ALWAYS') {
			uni.showModal({
				title: '需要视频访问权限',
				content: '请在系统设置中允许“本地影库”访问照片和视频，然后返回重新扫描。',
				confirmText: '去设置',
				cancelText: '稍后',
				success: (res) => {
					if (res.confirm) openAndroidPermissionSettings()
				}
			})
		} else if (e?.code === 'PERMISSION_DENIED') {
			showToast('未获得视频访问权限，可稍后在设置中重新扫描', 'error', 2800)
		} else {
			showToast(e?.message || '扫描本地视频失败', 'error')
		}
	}
}

function confirmClearLibrary() {
	uni.showModal({
		title: '清空媒体库',
		content: '只会移除应用内的视频索引和播放记录，不会删除手机里的原文件。',
		confirmText: '清空',
		confirmColor: '#E85D5D',
		cancelText: '取消',
		success: (res) => {
			if (!res.confirm) return
			clearLibrary()
			showToast('媒体库已清空', 'success')
		}
	})
}

function confirmClearHistory() {
	uni.showModal({
		title: '清空播放记录',
		content: '所有续播位置将被清除，视频文件不会受影响。',
		confirmText: '清空',
		confirmColor: '#E85D5D',
		cancelText: '取消',
		success: (res) => {
			if (!res.confirm) return
			state.history = []
			state.progress = {}
			state.lastPlayedId = ''
			state.currentId = ''
			state.queue = []
			saveState({ immediate: true })
			showToast('播放记录已清空', 'success')
		}
	})
}

function onDragOver(event) {
	if (!isH5) return
	const types = Array.from(event?.dataTransfer?.types || [])
	if (types.includes('Files')) {
		event.preventDefault()
		dragActive.value = true
	}
}

function onDragLeave(event) {
	if (!isH5) return
	if (event?.relatedTarget === null || event?.clientX <= 0 || event?.clientY <= 0) {
		dragActive.value = false
	}
}

async function onDrop(event) {
	if (!isH5) return
	event.preventDefault()
	dragActive.value = false
	let entries
	try { entries = await filesFromDropEvent(event) } catch (error) {
		showToast(error?.message || '无法读取拖入的文件', 'error')
		return
	}
	if (!entries.length) {
		showToast('没有识别到视频文件', 'error')
		return
	}
	await ingestBrowserEntries(entries)
}
</script>

<style scoped>
.home-page {
	position: relative;
	min-height: 100vh;
	overflow-x: hidden;
	background:
		radial-gradient(circle at 12% -5%, rgba(101, 224, 194, 0.1), transparent 28%),
		radial-gradient(circle at 90% 10%, rgba(232, 255, 99, 0.055), transparent 25%),
		var(--bg);
}

.ambient {
	position: fixed;
	border-radius: 50%;
	pointer-events: none;
	filter: blur(100px);
	opacity: 0.65;
	z-index: 0;
}
.ambient--one {
	width: 320px;
	height: 320px;
	top: 180px;
	left: -180px;
	background: rgba(37, 110, 99, 0.24);
}
.ambient--two {
	width: 300px;
	height: 300px;
	top: 50vh;
	right: -170px;
	background: rgba(104, 73, 33, 0.18);
}

.topbar {
	position: relative;
	z-index: 30;
	width: 100%;
	max-width: 1280px;
	margin: 0 auto;
	padding-left: 20px;
	padding-right: 20px;
	padding-bottom: 12px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}

.brand {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}
.brand-mark {
	width: 42px;
	height: 42px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 13px;
	background: rgba(232, 255, 99, 0.08);
	border: 1px solid rgba(232, 255, 99, 0.16);
	box-shadow: inset 0 0 20px rgba(232, 255, 99, 0.05);
}
.brand-copy { display: flex; flex-direction: column; gap: 1px; }
.brand-image { width: 42px; height: 42px; }
.tvbox-entry { padding: 10px 12px; border: 1px solid #405334; border-radius: 20px; color: #dafa6b; font-size: 12px; cursor: pointer; }
.brand-title { font-size: 19px; font-weight: 850; letter-spacing: -0.04em; line-height: 1.15; }
.brand-sub { font-size: 8px; font-weight: 700; letter-spacing: 0.3em; color: var(--muted); }

.top-actions { display: flex; align-items: center; gap: 9px; }
.icon-button--accent {
	background: var(--accent);
	border-color: var(--accent);
	box-shadow: 0 6px 22px rgba(232, 255, 99, 0.18);
}
.icon-button--accent:hover { background: #f2ff8f; }

.home-content {
	position: relative;
	z-index: 10;
	width: 100%;
	max-width: 1280px;
	margin: 0 auto;
	padding: 6px 20px calc(128px + var(--safe-bottom));
}

.preview-notice {
	display: flex;
	align-items: center;
	gap: 10px;
	margin: 4px 0 14px;
	padding: 10px 12px;
	border-radius: 12px;
	background: rgba(232, 255, 99, 0.055);
	border: 1px solid rgba(232, 255, 99, 0.13);
	animation: fade-in 0.4s ease;
}
.preview-icon {
	width: 30px;
	height: 30px;
	border-radius: 9px;
	background: rgba(232, 255, 99, 0.1);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.preview-copy { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.preview-title { font-size: 11.5px; font-weight: 750; color: #e6f2c9; }
.preview-sub { font-size: 10.5px; color: #9aa787; line-height: 1.45; }
.preview-close { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

/* Hero */
.hero {
	position: relative;
	width: 100%;
	min-height: 356px;
	border-radius: 22px;
	overflow: hidden;
	background: #101615;
	border: 1px solid rgba(255, 255, 255, 0.09);
	box-shadow: var(--shadow-card);
	cursor: pointer;
	isolation: isolate;
	animation: fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.hero-image { position: absolute; inset: 0; width: 100%; height: 100%; transform: scale(1.015); transition: transform 6s ease; }
.hero:hover .hero-image { transform: scale(1.055); }
.hero-fallback { position: absolute; inset: 0; overflow: hidden; }
.hero-orb {
	position: absolute;
	width: 340px;
	height: 340px;
	right: -40px;
	top: -110px;
	border-radius: 50%;
	background: radial-gradient(circle, rgba(232, 255, 99, 0.18), transparent 64%);
	filter: blur(18px);
}
.hero-grid {
	position: absolute;
	inset: 0;
	background-image:
		linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
		linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
	background-size: 46px 46px;
	transform: perspective(500px) rotateX(52deg) translateY(38%);
	transform-origin: bottom;
}
.hero-shade {
	position: absolute;
	inset: 0;
	background:
		linear-gradient(180deg, rgba(5, 8, 7, 0.18) 0%, rgba(5, 8, 7, 0.04) 28%, rgba(5, 8, 7, 0.78) 70%, rgba(5, 8, 7, 0.97) 100%),
		linear-gradient(90deg, rgba(5, 8, 7, 0.45) 0%, rgba(5, 8, 7, 0.05) 68%);
}
.hero-grain {
	position: absolute;
	inset: 0;
	opacity: 0.12;
	background-image: radial-gradient(rgba(255,255,255,0.3) 0.5px, transparent 0.5px);
	background-size: 4px 4px;
	mix-blend-mode: overlay;
	pointer-events: none;
}
.hero-topline {
	position: absolute;
	top: 16px;
	left: 18px;
	right: 18px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	z-index: 2;
}
.hero-label {
	display: flex;
	align-items: center;
	gap: 7px;
	font-size: 9.5px;
	font-weight: 800;
	letter-spacing: 0.18em;
	color: rgba(255, 255, 255, 0.86);
	text-transform: uppercase;
	padding: 6px 9px;
	border-radius: 999px;
	background: rgba(8, 12, 10, 0.32);
	border: 1px solid rgba(255, 255, 255, 0.12);
	backdrop-filter: blur(12px);
}
.live-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--accent);
	box-shadow: 0 0 0 3px rgba(232, 255, 99, 0.15);
	animation: soft-pulse 2s ease-in-out infinite;
}
.hero-quality {
	font-size: 9px;
	font-weight: 700;
	letter-spacing: 0.12em;
	color: rgba(255, 255, 255, 0.65);
	padding: 6px 9px;
	border-radius: 999px;
	background: rgba(8, 12, 10, 0.26);
	border: 1px solid rgba(255, 255, 255, 0.1);
}
.hero-sep { opacity: 0.35; margin: 0 4px; }

.hero-body {
	position: absolute;
	left: 20px;
	right: 96px;
	bottom: 20px;
	z-index: 2;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
}
.hero-latin {
	font-size: 9px;
	font-weight: 700;
	letter-spacing: 0.28em;
	color: rgba(232, 255, 99, 0.82);
	margin-bottom: 6px;
}
.hero-title {
	font-size: clamp(28px, 4vw, 44px);
	line-height: 1.02;
	font-weight: 900;
	letter-spacing: -0.055em;
	color: #fff;
	text-shadow: 0 3px 24px rgba(0, 0, 0, 0.3);
}
.hero-sub {
	margin-top: 8px;
	font-size: 11px;
	line-height: 1.55;
	color: rgba(255, 255, 255, 0.63);
	max-width: 560px;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}
.hero-progress-row {
	display: flex;
	align-items: center;
	gap: 10px;
	width: min(340px, 100%);
	margin-top: 14px;
}
.hero-progress-track {
	flex: 1;
	height: 3px;
	border-radius: 3px;
	background: rgba(255, 255, 255, 0.2);
	overflow: hidden;
}
.hero-progress-fill {
	height: 100%;
	border-radius: 3px;
	background: var(--accent);
	box-shadow: 0 0 12px rgba(232, 255, 99, 0.55);
}
.hero-progress-text { font-size: 9px; color: rgba(255, 255, 255, 0.7); font-weight: 700; }
.hero-actions { display: flex; align-items: center; gap: 9px; margin-top: 15px; flex-wrap: wrap; }

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
	letter-spacing: 0.01em;
	box-shadow: 0 8px 26px rgba(232, 255, 99, 0.13);
}
.primary-btn:hover { background: #f1ff8c; }
.ghost-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
	height: 38px;
	padding: 0 14px;
	border-radius: 10px;
	background: rgba(255, 255, 255, 0.075);
	color: var(--text);
	font-size: 12px;
	font-weight: 650;
	border: 1px solid rgba(255, 255, 255, 0.12);
	backdrop-filter: blur(8px);
}
.ghost-btn:hover { background: rgba(255, 255, 255, 0.12); }

.hero-play-ring {
	position: absolute;
	right: 22px;
	bottom: 26px;
	width: 68px;
	height: 68px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 3;
	transition: transform 0.24s ease;
}
.hero:hover .hero-play-ring { transform: scale(1.05); }
.hero-play-core {
	width: 52px;
	height: 52px;
	border-radius: 50%;
	background: var(--accent);
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}

/* Empty hero */
.empty-hero {
	position: relative;
	overflow: hidden;
	min-height: 300px;
	border-radius: 22px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background:
		radial-gradient(circle at 74% 18%, rgba(232, 255, 99, 0.1), transparent 36%),
		linear-gradient(130deg, #111817, #090c0d 68%);
	padding: 32px 26px;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	animation: fade-up 0.5s ease;
}
.empty-hero-glow {
	position: absolute;
	width: 250px;
	height: 250px;
	right: -50px;
	bottom: -110px;
	border-radius: 50%;
	background: rgba(101, 224, 194, 0.12);
	filter: blur(60px);
}
.empty-hero-icon {
	width: 56px;
	height: 56px;
	border-radius: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(232, 255, 99, 0.08);
	border: 1px solid rgba(232, 255, 99, 0.16);
	margin-bottom: 18px;
}
.empty-hero-kicker { font-size: 8.5px; letter-spacing: 0.26em; color: var(--muted); font-weight: 700; }
.empty-hero-title { font-size: clamp(28px, 3.6vw, 40px); font-weight: 900; letter-spacing: -0.05em; margin-top: 8px; }
.empty-hero-sub { color: var(--muted); font-size: 12px; line-height: 1.65; max-width: 440px; margin-top: 9px; }
.empty-hero-actions { display: flex; gap: 9px; margin-top: 20px; flex-wrap: wrap; }

/* Stats */
.stats-strip {
	display: grid;
	grid-template-columns: 1fr auto 1fr auto 1fr;
	align-items: center;
	gap: 10px;
	margin: 16px 0 26px;
	padding: 13px 16px;
	border-radius: 14px;
	background: rgba(255, 255, 255, 0.025);
	border: 1px solid rgba(255, 255, 255, 0.065);
}
.stat-item { display: flex; align-items: center; gap: 10px; min-width: 0; }
.stat-icon {
	width: 30px;
	height: 30px;
	border-radius: 9px;
	background: rgba(255, 255, 255, 0.045);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.stat-copy { display: flex; flex-direction: column; min-width: 0; }
.stat-value { font-size: 12.5px; font-weight: 800; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-label { font-size: 9px; color: var(--muted); margin-top: 1px; }
.stat-divider { width: 1px; height: 23px; background: rgba(255, 255, 255, 0.075); }

/* Library head */
.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.section-title-wrap { display: flex; flex-direction: column; gap: 3px; }
.section-title-row { display: flex; align-items: baseline; gap: 8px; }
.section-title { font-size: 25px; font-weight: 850; letter-spacing: -0.045em; line-height: 1.1; }
.section-count { font-size: 11px; color: var(--muted); font-weight: 700; }
.section-tools { display: flex; align-items: center; gap: 7px; }
.tool-pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 32px;
	padding: 0 11px;
	border-radius: 9px;
	background: rgba(255, 255, 255, 0.045);
	border: 1px solid rgba(255, 255, 255, 0.075);
	font-size: 10.5px;
	font-weight: 650;
	color: var(--text-2);
	white-space: nowrap;
}
.tool-pill:hover { background: rgba(255, 255, 255, 0.075); }
.tool-label { font-size: 10.5px; }

.search-row { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; animation: fade-in 0.2s ease; }
.search-box {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 9px;
	height: 42px;
	padding: 0 12px;
	border-radius: 11px;
	background: rgba(255, 255, 255, 0.045);
	border: 1px solid rgba(255, 255, 255, 0.09);
}
.search-input { flex: 1; height: 100%; font-size: 12.5px; color: var(--text); background: transparent; }
.search-placeholder { color: #636b63; font-size: 12.5px; }
.search-clear { width: 21px; height: 21px; border-radius: 50%; background: rgba(255, 255, 255, 0.09); display: flex; align-items: center; justify-content: center; }
.search-cancel { font-size: 12px; color: var(--muted); padding: 8px 2px; flex-shrink: 0; }

.chip-row { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 5px; margin-bottom: 12px; scrollbar-width: none; }
.filter-chip {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	height: 27px;
	padding: 0 10px;
	border-radius: 8px;
	border: 1px solid rgba(255, 255, 255, 0.07);
	background: rgba(255, 255, 255, 0.025);
	color: #929a90;
	font-size: 10.5px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.18s ease;
}
.filter-chip:hover { color: var(--text-2); border-color: rgba(255, 255, 255, 0.14); }
.filter-chip.is-active { background: var(--accent); border-color: var(--accent); color: #0a0d0a; font-weight: 800; }
.chip-count { font-size: 8.5px; opacity: 0.55; }
.chip-folder-text { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filter-chip--folder { background: var(--accent); border-color: var(--accent); color: #0a0d0a; }

.video-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 13px; }
.video-grid.is-list { grid-template-columns: 1fr; gap: 5px; }
.card-slot { min-width: 0; animation: fade-up 0.42s cubic-bezier(0.22, 1, 0.36, 1) both; }

/* Empty states */
.empty-library {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 50px 20px 54px;
	border-radius: 16px;
	border: 1px dashed rgba(255, 255, 255, 0.1);
	background: rgba(255, 255, 255, 0.018);
}
.empty-library--small { padding: 38px 20px; gap: 5px; }
.empty-illustration { margin-bottom: 20px; }
.film-strip {
	display: flex;
	align-items: center;
	gap: 5px;
	padding: 7px 9px;
	border-radius: 7px;
	background: #1b211d;
	border: 1px solid rgba(255, 255, 255, 0.08);
	transform: rotate(-4deg);
	box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}
.film-hole { width: 5px; height: 5px; border-radius: 1px; background: #080b09; }
.film-frame { width: 54px; height: 36px; border-radius: 3px; background: #0c1110; display: flex; align-items: center; justify-content: center; }
.empty-title { font-size: 17px; font-weight: 800; letter-spacing: -0.03em; margin-top: 3px; }
.empty-sub { font-size: 11.5px; color: var(--muted); line-height: 1.6; max-width: 330px; margin: 5px 0 16px; }

/* Folder tab */
.page-heading { display: flex; flex-direction: column; gap: 2px; margin: 8px 0 22px; }
.page-heading--row { flex-direction: row; align-items: flex-end; justify-content: space-between; gap: 16px; }
.page-heading-copy { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.page-title { font-size: clamp(30px, 4.5vw, 46px); line-height: 1.05; font-weight: 900; letter-spacing: -0.055em; margin-top: 3px; }
.page-sub { font-size: 11.5px; color: var(--muted); margin-top: 6px; }
.folder-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.folder-card { animation: fade-up 0.4s ease both; cursor: pointer; }
.folder-mosaic {
	position: relative;
	display: grid;
	grid-template-columns: 1.4fr 1fr;
	grid-template-rows: 1fr 1fr;
	gap: 3px;
	height: 144px;
	overflow: hidden;
	border-radius: 14px;
	background: #131817;
	border: 1px solid rgba(255, 255, 255, 0.07);
}
.mosaic-img { width: 100%; height: 100%; display: block; }
.mosaic-img:first-child { grid-row: span 2; }
.mosaic-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.02) 40%, rgba(3,5,4,0.45)); pointer-events: none; }
.folder-badge {
	position: absolute;
	top: 9px;
	left: 9px;
	display: flex;
	align-items: center;
	gap: 5px;
	padding: 5px 8px;
	border-radius: 7px;
	background: var(--accent);
	color: #0a0d0a;
	font-size: 10px;
	font-weight: 850;
}
.folder-play {
	position: absolute;
	right: 10px;
	bottom: 10px;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	background: rgba(232, 255, 99, 0.92);
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transform: scale(0.8);
	transition: all 0.2s ease;
}
.folder-card:hover .folder-play { opacity: 1; transform: scale(1); }
.folder-meta { padding: 9px 2px 0; display: flex; flex-direction: column; gap: 3px; }
.folder-name { font-size: 14px; font-weight: 750; letter-spacing: -0.02em; }
.folder-sub { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--muted); }

/* History */
.history-list { display: flex; flex-direction: column; gap: 9px; }
.history-item {
	display: flex;
	gap: 12px;
	padding: 9px;
	border-radius: 14px;
	border: 1px solid rgba(255, 255, 255, 0.06);
	background: rgba(255, 255, 255, 0.022);
	animation: fade-up 0.36s ease both;
	cursor: pointer;
}
.history-item:hover { background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.1); }
.history-poster {
	position: relative;
	width: 136px;
	aspect-ratio: 16 / 9;
	border-radius: 9px;
	overflow: hidden;
	flex-shrink: 0;
	background: #111615;
}
.history-img { width: 100%; height: 100%; }
.history-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.history-play {
	position: absolute;
	right: 7px;
	bottom: 7px;
	width: 27px;
	height: 27px;
	border-radius: 50%;
	background: rgba(232, 255, 99, 0.94);
	display: flex;
	align-items: center;
	justify-content: center;
}
.history-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2.5px; background: rgba(255, 255, 255, 0.2); }
.history-progress-fill { height: 100%; background: var(--accent); }
.history-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
.history-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.history-title { font-size: 13px; font-weight: 750; letter-spacing: -0.02em; }
.history-time { font-size: 9px; color: var(--dim); flex-shrink: 0; }
.history-folder { font-size: 10px; color: var(--muted); }
.history-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; }
.history-status { font-size: 10px; color: #b5bdb2; }
.history-status.is-done { color: var(--mint); }
.history-resume { display: flex; align-items: center; gap: 3px; font-size: 10px; color: var(--accent); font-weight: 750; flex-shrink: 0; }

/* Settings */
.settings-group { margin-bottom: 22px; }
.settings-group-label { display: block; font-size: 9px; letter-spacing: 0.2em; color: var(--muted); font-weight: 750; text-transform: uppercase; margin: 0 4px 8px; }
.settings-card {
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.065);
	background: rgba(255, 255, 255, 0.024);
	overflow: hidden;
}
.setting-row { display: flex; align-items: center; gap: 11px; padding: 13px 14px; }
.setting-row--tap { cursor: pointer; }
.setting-row--tap:hover { background: rgba(255, 255, 255, 0.03); }
.setting-row--column { flex-direction: column; align-items: stretch; gap: 11px; }
.setting-row-main { display: flex; align-items: center; gap: 11px; }
.setting-icon {
	width: 33px;
	height: 33px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.setting-icon--mint { background: rgba(101, 224, 194, 0.1); }
.setting-icon--amber { background: rgba(255, 196, 120, 0.1); }
.setting-icon--violet { background: rgba(221, 167, 255, 0.1); }
.setting-icon--accent { background: var(--accent); }
.setting-icon--danger { background: rgba(255, 119, 119, 0.09); }
.setting-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.setting-name { font-size: 12.5px; font-weight: 700; letter-spacing: -0.01em; }
.setting-desc { font-size: 10px; color: var(--muted); line-height: 1.45; }
.setting-value { font-size: 11px; color: var(--accent); font-weight: 750; }
.setting-divider { height: 1px; background: rgba(255, 255, 255, 0.055); margin-left: 58px; }
.switch {
	width: 40px;
	height: 23px;
	border-radius: 99px;
	background: rgba(255, 255, 255, 0.12);
	padding: 2.5px;
	flex-shrink: 0;
	transition: background 0.22s ease;
}
.switch.is-on { background: var(--accent); }
.switch-thumb {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #e8ebe3;
	transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
	box-shadow: 0 2px 5px rgba(0,0,0,.2);
}
.switch.is-on .switch-thumb { transform: translateX(17px); background: #0a0d0a; }
.rate-row { display: flex; gap: 6px; flex-wrap: wrap; }
.rate-chip {
	height: 28px;
	padding: 0 11px;
	border-radius: 7px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.07);
	font-size: 10.5px;
	color: var(--muted);
	font-weight: 650;
}
.rate-chip.is-active { background: var(--accent); border-color: var(--accent); color: #0a0d0a; }
.about-block { display: flex; gap: 13px; padding: 16px 14px; }
.about-mark {
	width: 52px;
	height: 52px;
	border-radius: 15px;
	background: rgba(232, 255, 99, 0.07);
	border: 1px solid rgba(232, 255, 99, 0.14);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.about-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.about-name { font-size: 14px; font-weight: 800; letter-spacing: -0.025em; }
.about-version { font-size: 9px; color: var(--muted); font-weight: 600; margin-left: 4px; }
.about-desc { font-size: 10.5px; color: var(--muted); line-height: 1.5; }
.about-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
.about-tags text { font-size: 8px; color: #949c91; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.06); }
.about-note { display: flex; align-items: center; gap: 7px; padding: 11px 14px; font-size: 10px; color: var(--muted); }
.settings-footer { text-align: center; padding: 16px 0 4px; font-size: 7.5px; letter-spacing: 0.22em; color: #3e453f; }

/* Dock */
.dock-wrap {
	position: fixed;
	left: 0;
	right: 0;
	bottom: calc(12px + var(--safe-bottom));
	z-index: 100;
	display: flex;
	justify-content: center;
	padding: 0 14px;
	pointer-events: none;
}
.dock {
	width: 100%;
	max-width: 430px;
	height: 60px;
	border-radius: 19px;
	border: 1px solid rgba(255, 255, 255, 0.11);
	background: rgba(14, 17, 16, 0.86);
	backdrop-filter: blur(28px) saturate(150%);
	-webkit-backdrop-filter: blur(28px) saturate(150%);
	box-shadow: 0 16px 44px rgba(0, 0, 0, 0.46);
	display: flex;
	align-items: center;
	justify-content: space-around;
	padding: 5px 7px;
	pointer-events: auto;
}
.dock-item {
	position: relative;
	flex: 1;
	height: 49px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 3px;
	border-radius: 14px;
	color: #a9b0a7;
	transition: background 0.2s ease, color 0.2s ease;
}
.dock-item.is-active { background: var(--accent); color: #0a0d0a; }
.dock-label { font-size: 8.5px; font-weight: 700; letter-spacing: 0.02em; }
.dock-badge {
	position: absolute;
	top: 5px;
	right: calc(50% - 17px);
	min-width: 13px;
	height: 13px;
	padding: 0 3px;
	border-radius: 99px;
	background: #ff7d6d;
	color: #1a0705;
	font-size: 7px;
	font-weight: 850;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 1px solid #0e1110;
}
.dock-item.is-active .dock-badge { border-color: var(--accent); }

/* Sort sheet */
.sort-list { display: flex; flex-direction: column; gap: 3px; }
.sort-option { display: flex; align-items: center; gap: 11px; padding: 11px 10px; border-radius: 11px; cursor: pointer; }
.sort-option:hover { background: rgba(255, 255, 255, 0.035); }
.sort-option.is-active { background: rgba(232, 255, 99, 0.075); }
.sort-icon {
	width: 35px;
	height: 35px;
	border-radius: 10px;
	background: rgba(255, 255, 255, 0.05);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.sort-option.is-active .sort-icon { background: var(--accent); }
.sort-copy { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.sort-name { font-size: 12.5px; font-weight: 700; }
.sort-desc { font-size: 9.5px; color: var(--muted); }
.radio { width: 19px; height: 19px; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; }
.radio.is-on { border-color: var(--accent); }
.radio-core { width: 9px; height: 9px; border-radius: 50%; background: transparent; }
.radio.is-on .radio-core { background: var(--accent); }
.direction-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 15px 10px 5px; margin-top: 6px; border-top: 1px solid var(--line); }
.direction-label { display: flex; flex-direction: column; gap: 1px; }
.segmented { display: flex; padding: 3px; border-radius: 9px; background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.06); }
.segment { height: 27px; padding: 0 12px; border-radius: 6px; display: flex; align-items: center; font-size: 10.5px; color: var(--muted); font-weight: 650; }
.segment.is-on { background: var(--accent); color: #0a0d0a; }

/* Add sheet */
.add-options { display: flex; flex-direction: column; gap: 7px; }
.add-option { display: flex; align-items: center; gap: 12px; padding: 13px 12px; border-radius: 13px; border: 1px solid rgba(255, 255, 255, 0.07); background: rgba(255, 255, 255, 0.03); cursor: pointer; }
.add-option:hover { background: rgba(255, 255, 255, 0.055); }
.add-option.is-primary { background: var(--accent); border-color: var(--accent); color: #0a0d0a; }
.add-option.is-primary .add-desc { color: rgba(10, 13, 10, 0.58); }
.add-icon { width: 40px; height: 40px; border-radius: 11px; background: rgba(0, 0, 0, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.add-option:not(.is-primary) .add-icon { background: rgba(255, 255, 255, 0.05); }
.add-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.add-title { font-size: 12.5px; font-weight: 750; }
.add-desc { font-size: 10px; color: var(--muted); line-height: 1.45; }
.permission-note { display: flex; align-items: flex-start; gap: 7px; padding: 9px 10px; font-size: 10px; line-height: 1.5; color: var(--muted); }

/* Format guide */
.format-guide { display: flex; flex-direction: column; gap: 16px; }
.guide-section { display: flex; flex-direction: column; gap: 4px; }
.guide-title { font-size: 12px; font-weight: 750; color: var(--text); }
.guide-text { font-size: 11px; line-height: 1.7; color: var(--muted); }
.format-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.format-tag { font-size: 9px; font-weight: 750; padding: 5px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.07); color: #aab1a8; }
.guide-tip { display: flex; align-items: flex-start; gap: 8px; padding: 11px; border-radius: 10px; background: rgba(232, 255, 99, 0.055); border: 1px solid rgba(232, 255, 99, 0.11); font-size: 10.5px; line-height: 1.55; color: #b8c2a5; }

/* Scan overlay */
.scan-overlay {
	position: fixed;
	inset: 0;
	z-index: 2500;
	background: rgba(4, 6, 5, 0.72);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
	animation: fade-in 0.2s ease;
}
.scan-card {
	width: 100%;
	max-width: 330px;
	border-radius: 20px;
	background: #111614;
	border: 1px solid rgba(255, 255, 255, 0.09);
	box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
	padding: 30px 24px 22px;
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
}
.scan-spinner { position: relative; width: 62px; height: 62px; display: flex; align-items: center; justify-content: center; margin-bottom: 15px; }
.scan-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(232, 255, 99, 0.13); border-top-color: var(--accent); animation: spin 1s linear infinite; }
.scan-title { font-size: 14px; font-weight: 750; }
.scan-bar { width: 100%; height: 4px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); overflow: hidden; margin: 16px 0 7px; }
.scan-bar-fill { height: 100%; border-radius: 4px; background: var(--accent); transition: width 0.25s ease; }
.scan-percent { font-size: 10px; color: var(--accent); font-weight: 750; }
.scan-note { font-size: 10px; color: var(--muted); margin-top: 7px; }

/* Drag & drop */
.drop-overlay {
	position: fixed;
	inset: 0;
	z-index: 2600;
	background: rgba(4, 7, 6, 0.86);
	backdrop-filter: blur(10px);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
	pointer-events: none;
}
.drop-card {
	width: 100%;
	max-width: 420px;
	height: 240px;
	border-radius: 22px;
	border: 2px dashed rgba(232, 255, 99, 0.5);
	background: rgba(232, 255, 99, 0.045);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 9px;
}
.drop-title { font-size: 20px; font-weight: 850; letter-spacing: -0.04em; }
.drop-sub { font-size: 11px; color: var(--muted); }

/* Desktop */
@media (min-width: 760px) {
	.topbar { padding-left: 34px; padding-right: 34px; padding-bottom: 18px; }
	.home-content { padding: 10px 34px calc(140px + var(--safe-bottom)); }
	.hero { min-height: 408px; border-radius: 26px; }
	.hero-body { left: 30px; right: 130px; bottom: 30px; }
	.hero-topline { top: 22px; left: 26px; right: 26px; }
	.hero-play-ring { right: 36px; bottom: 38px; width: 78px; height: 78px; }
	.hero-play-core { width: 60px; height: 60px; }
	.stats-strip { padding: 15px 22px; margin: 18px 0 32px; }
	.stat-value { font-size: 14px; }
	.video-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px 18px; }
	.video-grid.is-list { grid-template-columns: 1fr; }
	.folder-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
	.folder-mosaic { height: 190px; }
	.history-item { padding: 11px; gap: 15px; }
	.history-poster { width: 180px; }
	.history-title { font-size: 14px; }
	.settings-group { margin-bottom: 26px; }
	.setting-row { padding: 15px 18px; }
	.setting-divider { margin-left: 72px; }
	.dock { max-width: 460px; height: 64px; }
	.dock-item { height: 53px; }
}

@media (min-width: 1120px) {
	.video-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
	.hero { min-height: 440px; }
}

@media (max-width: 390px) {
	.home-content { padding-left: 15px; padding-right: 15px; }
	.topbar { padding-left: 15px; padding-right: 15px; }
	.hero-body { left: 16px; right: 80px; bottom: 16px; }
	.hero-play-ring { right: 14px; bottom: 18px; width: 58px; height: 58px; }
	.hero-play-core { width: 44px; height: 44px; }
	.stats-strip { gap: 6px; padding: 11px 10px; }
	.stat-icon { display: none; }
	.stat-value { font-size: 11px; }
	.video-grid { gap: 15px 9px; }
	.hero-title { font-size: 29px; }
	.hero-sub { font-size: 10px; }
	.history-poster { width: 112px; }
}

.tvbox-home{padding-top:calc(24px + var(--status-bar-height, 0px));}
.home-content.tvbox-popup-open{z-index:150;}
.folder-page-header{padding-left:24px;padding-right:24px}
.home-page.is-folder-page{touch-action:pan-y}
</style>
