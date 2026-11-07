/**
 * 压低语音包体积
 *
 * 默认音频是 edge-tts 的 24kHz / 48kbps，语音内容用不上这么多码率。
 * 转 22.05kHz / 32kbps mono 后体积约降三分之一，儿童音色的齿音仍然清楚
 * （再降到 16kHz 会发闷，不建议）。
 *
 * 用法：node tools/voice-shrink.mjs [--dry] [--prune]
 *   --dry    只统计，不动文件
 *   --prune  顺便删掉"索引里没有"的孤儿音频（改了文案后旧文件会残留）
 *
 * 跑完不需要重建索引（文件名不变）。
 * 幂等：已经 ≤32kbps 的文件会跳过，重复跑不会二次损伤音质。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ROOT } from './sync-uts.mjs'

const run = promisify(execFile)
const DIR = path.join(ROOT, 'static', 'voice')
const SCRIPT = path.join(ROOT, 'tools', 'voice-script.json')
const DRY = process.argv.includes('--dry')
const PRUNE = process.argv.includes('--prune')
const TARGET_KBPS = 32
const TARGET_RATE = 22050
const CONCURRENCY = 8

function voiceKey(text) {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = (h * 131 + text.charCodeAt(i)) % 2147483647
  }
  return 'v' + h.toString(16).padStart(8, '0')
}

async function bitrateOf(file) {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=bit_rate', '-of', 'csv=p=0', file
    ])
    return parseInt(stdout.trim(), 10) || 0
  } catch {
    return 0
  }
}

async function pool(items, limit, worker) {
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx])
    }
  })
  await Promise.all(runners)
}

if (!fs.existsSync(DIR)) {
  console.error('目录不存在：' + DIR)
  process.exit(1)
}

let files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mp3'))

/* ---------- 清理孤儿 ---------- */
if (PRUNE && fs.existsSync(SCRIPT)) {
  const wanted = new Set(
    JSON.parse(fs.readFileSync(SCRIPT, 'utf8')).items.map((it) => voiceKey(it.text))
  )
  const orphans = files.filter((f) => !wanted.has(f.slice(0, -4)))
  for (const f of orphans) fs.rmSync(path.join(DIR, f), { force: true })
  console.log(`清理孤儿音频 ${orphans.length} 个`)
  files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mp3'))
}

/* ---------- 压缩 ---------- */
let done = 0
let skipped = 0
let saved = 0
let total = files.length
const before = files.reduce((a, f) => a + fs.statSync(path.join(DIR, f)).size, 0)

await pool(files, CONCURRENCY, async (f) => {
  const p = path.join(DIR, f)
  const size = fs.statSync(p).size
  const br = await bitrateOf(p)
  if (br > 0 && br <= TARGET_KBPS * 1000 + 4000) {
    skipped++
    return
  }
  if (DRY) {
    done++
    return
  }
  const tmp = p + '.tmp.mp3'
  try {
    await run('ffmpeg', [
      '-loglevel', 'error', '-y', '-i', p,
      '-ac', '1', '-ar', String(TARGET_RATE), '-b:a', TARGET_KBPS + 'k', tmp
    ])
    const after = fs.statSync(tmp).size
    if (after > 800 && after < size) {
      fs.renameSync(tmp, p)
      saved += size - after
      done++
    } else {
      fs.rmSync(tmp, { force: true })
      skipped++
    }
  } catch {
    fs.rmSync(tmp, { force: true })
    skipped++
  }
  if ((done + skipped) % 300 === 0) console.log(`  进度 ${done + skipped}/${total}`)
})

const after = files.reduce((a, f) => a + fs.statSync(path.join(DIR, f)).size, 0)
console.log(`\n${DRY ? '[dry] ' : ''}压缩 ${done} 个，跳过 ${skipped} 个，省 ${((before - after) / 1024 / 1024).toFixed(1)} MB`)
console.log(`当前语音包 ${(after / 1024 / 1024).toFixed(1)} MB（${files.length} 条）`)
