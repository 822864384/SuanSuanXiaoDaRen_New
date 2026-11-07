/**
 * 引擎测试运行器：把 common/*.uts 临时同步成 .mts 再跑 Node 测试
 * 好处：唯一真源仍是 .uts，不会出现副本漂移（每次运行前重建）
 *
 * 用法：node tests/run-engine-test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const commonDir = path.join(root, 'common')
const tmpDir = path.join(root, 'tests', 'engine-tmp')

if (!fs.existsSync(commonDir)) {
  console.error('找不到 ' + commonDir)
  process.exit(1)
}

fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })

// Node 环境没有 UTS 原生插件：给它一个同名桩，保证 common/tts.uts 里的
// `@/uni_modules/ssxdr-speech` 能被解析（只测逻辑，不测发声）
fs.writeFileSync(
  path.join(tmpDir, '__plugin_stub.mts'),
  'export function ttsSpeak(text: string, rate: number, pitch: number, lang: string): boolean { return false }\n' +
    'export function ttsStop(): void {}\n' +
    'export function ttsWarmup(): void {}\n'
)

let count = 0
for (const f of fs.readdirSync(commonDir)) {
  if (!f.endsWith('.uts')) continue
  const code = fs
    .readFileSync(path.join(commonDir, f), 'utf8')
    // 同目录内的 .uts 引用改成 .mts，Node 才能解析
    .replace(/from\s+'\.\/([A-Za-z0-9_\-]+)\.uts'/g, "from './$1.mts'")
    // UTS 原生插件在 Node 里不存在，替换成桩
    .replace(/from\s+'@\/uni_modules\/ssxdr-speech'/g, "from './__plugin_stub.mts'")
  fs.writeFileSync(path.join(tmpDir, f.replace(/\.uts$/, '.mts')), code)
  count++
}
console.log('已同步 ' + count + ' 个模块到 tests/engine-tmp')

const files = ['engine.test.mts', 'narration.test.mts', 'mind.test.mts', 'study.test.mts', 'so.test.mts', 'explain.test.mts', 'voice.test.mts', 'voice-play.test.mts', 'say-queue.test.mts', 'wrongbook.test.mts']
let status = 0
for (const f of files) {
  console.log('\n=== ' + f + ' ===')
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', path.join(root, 'tests', f)],
    { stdio: 'inherit' }
  )
  if (r.status !== 0) status = r.status === null ? 1 : r.status
}

fs.rmSync(tmpDir, { recursive: true, force: true })
process.exit(status)
