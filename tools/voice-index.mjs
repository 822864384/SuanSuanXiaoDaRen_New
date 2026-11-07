/**
 * 扫 static/voice/*.mp3 → 重写 common/voice-index.uts
 *
 * 用法：node tools/voice-index.mjs
 *
 * 和 `python tools/voice-gen.py` 结尾做的事等价：**手动增删音频、从别处拷来一批素材**时用它，
 * 不必重新合成。两条路径写出的内容一致（索引只关心"哪些 key 存在"）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './sync-uts.mjs'

const OUT_DIR = path.join(ROOT, 'static', 'voice')
const INDEX = path.join(ROOT, 'common', 'voice-index.uts')

if (!fs.existsSync(OUT_DIR)) {
  console.error('目录不存在：' + OUT_DIR)
  process.exit(1)
}

const keys = fs
  .readdirSync(OUT_DIR)
  .filter((f) => f.endsWith('.mp3'))
  .filter((f) => fs.statSync(path.join(OUT_DIR, f)).size > 800)
  .map((f) => f.slice(0, -4))
  .sort()

const body = keys.map((k) => `  '${k}'`).join(',\n')

const src = `/**
 * 真人语音包索引（**自动生成，不要手改**）
 *
 * 由 \`python tools/voice-gen.py\`（或 \`node tools/voice-index.mjs\` 单独刷新）扫描
 * \`static/voice/*.mp3\` 后重写本文件。
 * 每一条 = \`static/voice/<key>.mp3\` 的存在凭证，运行时用 \`voiceKey(text)\` 算 key 再查这里。
 *
 * 为什么把"有哪些音频"编进代码而不是运行时读目录：
 * App 端读 static 目录要原生 API，Android 7 盒子上各厂商实现不一；
 * 而几百个 8 位字符串编进包里只有几 KB，查询是一次数组线性查找，零 IO 零失败。
 */

/** 已生成音频的 key 列表（共 ${keys.length} 条） */
export const VOICE_KEYS: Array<string> = [
${body}
]
`

fs.writeFileSync(INDEX, src, 'utf8')

const mb =
  keys.reduce((a, k) => a + fs.statSync(path.join(OUT_DIR, k + '.mp3')).size, 0) / 1024 / 1024
console.log(`索引 ${keys.length} 条，音频包 ${mb.toFixed(1)} MB -> ${INDEX}`)
