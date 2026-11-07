/**
 * 把 common/*.uts 同步成 .mts，供 Node 侧 import
 *
 * 与 `tests/run-engine-test.mjs` 用同一套替换规则：
 * 唯一真源仍是 .uts，工具脚本读的是"实时快照"，不存在副本漂移。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

/** @returns {string} 临时目录绝对路径 */
export function syncCommon(tag = 'voice-tmp') {
  const commonDir = path.join(ROOT, 'common')
  const tmpDir = path.join(ROOT, 'tools', '.' + tag)

  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  // Node 里没有 UTS 原生插件，给个同名桩，保证 tts.uts 能解析
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
      .replace(/from\s+'\.\/([A-Za-z0-9_\-]+)\.uts'/g, "from './$1.mts'")
      .replace(/from\s+'@\/uni_modules\/ssxdr-speech'/g, "from './__plugin_stub.mts'")
    fs.writeFileSync(path.join(tmpDir, f.replace(/\.uts$/, '.mts')), code)
    count++
  }
  return { dir: tmpDir, count }
}

export function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

export { ROOT }
