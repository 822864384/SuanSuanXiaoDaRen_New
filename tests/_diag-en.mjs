/** 临时诊断：英文题干的第二段音频到底存不存在、有多长 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const commonDir = path.join(root, 'common')
const tmpDir = path.join(root, 'tests', 'engine-tmp')

fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })
fs.writeFileSync(
  path.join(tmpDir, '__plugin_stub.mts'),
  'export function ttsSpeak(text: string, rate: number, pitch: number, lang: string): boolean { return false }\n' +
    'export function ttsStop(): void {}\n' +
    'export function ttsWarmup(): void {}\n'
)
for (const f of fs.readdirSync(commonDir)) {
  if (!f.endsWith('.uts')) continue
  const code = fs
    .readFileSync(path.join(commonDir, f), 'utf8')
    .replace(/from\s+'\.\/([A-Za-z0-9_\-]+)\.uts'/g, "from './$1.mts'")
    .replace(/from\s+'@\/uni_modules\/ssxdr-speech'/g, "from './__plugin_stub.mts'")
  fs.writeFileSync(path.join(tmpDir, f.replace(/\.uts$/, '.mts')), code)
}

const { voiceKey } = await import('./engine-tmp/voice-tpl.mts')

const texts = [
  '豆豆，请听题。',
  'cat，小猫，哪个是cat？',
  '图上是小狗，dog，哪个词是dog？',
  'apple，苹果，哪个是apple？',
  'cat',
  'apple',
  '再听一遍。',
  '你想选哪一个呀？'
]
for (const t of texts) {
  const k = voiceKey(t)
  const p = path.join(root, 'static', 'voice', k + '.mp3')
  let info = '缺失'
  if (fs.existsSync(p)) {
    const size = fs.statSync(p).size
    let dur = '?'
    try {
      dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${p}"`).toString().trim()
    } catch (e) {
      dur = 'ffprobe失败'
    }
    info = size + ' bytes, ' + dur + 's'
  }
  console.log(k + '  ' + t + '  -> ' + info)
}
fs.rmSync(tmpDir, { recursive: true, force: true })
