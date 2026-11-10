export function fullscreenViewport(info, direction) {
  const short = Math.min(info.screenWidth || info.windowWidth, info.screenHeight || info.windowHeight)
  const long = Math.max(info.screenWidth || info.windowWidth, info.screenHeight || info.windowHeight)
  return direction === 'portrait' ? { width: short, height: long } : { width: long, height: short }
}
