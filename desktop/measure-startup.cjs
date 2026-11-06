const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const executable = path.resolve(process.argv[2] || path.join(__dirname, 'dist/win-unpacked/本地影库.exe'))
if (!fs.existsSync(executable)) throw new Error(`请先打包：${executable}`)
const root = path.join(__dirname, '.startup-check', String(Date.now()))
fs.mkdirSync(root, { recursive: true })

async function measure(run) {
  const report = path.join(root, `run-${run}.json`)
  await new Promise((resolve, reject) => {
    const child = spawn(executable, ['--measure-startup'], {
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        LOCALVIDEO_STARTUP_PROFILE: path.join(root, 'profile'),
        LOCALVIDEO_STARTUP_REPORT: report,
        LOCALVIDEO_STARTUP_STARTED_AT: String(Date.now())
      }
    })
    const timer = setTimeout(() => { child.kill(); reject(new Error('启动检查在 45 秒内没有完成')) }, 45000)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0 || !fs.existsSync(report)) reject(new Error(`启动检查未生成报告，退出码 ${code}`))
      else resolve()
    })
  })
  return { run, ...JSON.parse(fs.readFileSync(report, 'utf8')) }
}

;(async () => {
  const results = []
  for (let run = 1; run <= 2; run++) results.push(await measure(run))
  console.log(JSON.stringify({ executable, results }, null, 2))
})().catch((error) => { console.error(error.message); process.exitCode = 1 })
