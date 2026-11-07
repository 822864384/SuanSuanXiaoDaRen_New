/**
 * 生成音效 WAV（无需任何外部素材与依赖）
 *
 * 之所以用代码合成而不是找现成音效：
 * 1. 版权干净，纯正弦叠加，可商用；
 * 2. 音色可调，改参数重跑即可，不用来回找文件；
 * 3. 体积小（22.05kHz / 16bit / 单声道，单个约 27KB）。
 *
 * 设计原则（对齐产品规范「不用否定性音效」）：
 * - 答对：上行琶音 C5-E5-G5-C6，明亮但不刺耳
 * - 答错：柔和下行 G4-Eb4，像水滴提示，不是"错误蜂鸣"
 * - 出题：两声高音叮咚，抓住注意力
 *
 * 用法：node tests/make-sfx.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const SR = 22050
const OUT = path.resolve(import.meta.dirname, '..', 'static', 'sfx')

/** 合成一个音符：基频 + 泛音，带 attack/release 与指数衰减，避免爆音 */
function tone(freq, dur, amp, opt = {}) {
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  const attack = opt.attack ?? 0.008
  const release = opt.release ?? 0.06
  const decay = opt.decay ?? 2.2
  const harm = opt.harm ?? [1, 0.28, 0.12]
  for (let i = 0; i < n; i++) {
    const t = i / SR
    let v = 0
    for (let h = 0; h < harm.length; h++) {
      v += harm[h] * Math.sin(2 * Math.PI * freq * (h + 1) * t)
    }
    const atk = Math.min(1, t / attack)
    const rel = Math.min(1, (dur - t) / release)
    out[i] = v * amp * atk * Math.max(0, rel) * Math.exp(-t * decay)
  }
  return out
}

/** 把 note 叠加到 base 的 offset 秒处 */
function mix(base, note, offsetSec) {
  const off = Math.floor(offsetSec * SR)
  for (let i = 0; i < note.length; i++) {
    const j = i + off
    if (j < 0 || j >= base.length) continue
    base[j] += note[i]
  }
  return base
}

/** Float32 采样 -> 16bit PCM WAV（单声道） */
function toWav(samples) {
  const dataBytes = samples.length * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)          // fmt chunk 长度
  buf.writeUInt16LE(1, 20)           // PCM
  buf.writeUInt16LE(1, 22)           // 单声道
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)      // 字节率
  buf.writeUInt16LE(2, 32)           // 块对齐
  buf.writeUInt16LE(16, 34)          // 位深
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

function save(name, samples) {
  // 归一化：避免叠加后削顶
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  const gain = peak > 0.92 ? 0.92 / peak : 1
  const norm = Float32Array.from(samples, (v) => v * gain)
  const file = path.join(OUT, name)
  fs.writeFileSync(file, toWav(norm))
  const kb = (fs.statSync(file).size / 1024).toFixed(1)
  console.log('  ' + name.padEnd(16) + kb + ' KB   ' + (samples.length / SR).toFixed(2) + 's')
}

fs.mkdirSync(OUT, { recursive: true })

console.log('生成音效 -> ' + OUT)

// 答对：C5 E5 G5 C6 快速上行，尾音留长一点做"完成感"
{
  const buf = new Float32Array(Math.floor(SR * 0.66))
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => mix(buf, tone(f, 0.34, 0.26, { decay: 3.6, release: 0.14 }), i * 0.088))
  save('correct.wav', buf)
}

// 答错：G4 -> Eb4 柔和下行（小提示，不是否定），泛音少一点更"水"
{
  const buf = new Float32Array(Math.floor(SR * 0.72))
  mix(buf, tone(392.0, 0.30, 0.24, { decay: 2.4, release: 0.16, harm: [1, 0.14] }), 0)
  mix(buf, tone(311.13, 0.44, 0.24, { decay: 2.0, release: 0.22, harm: [1, 0.12] }), 0.19)
  save('wrong.wav', buf)
}

// 出题：E6 -> A6 两声叮咚，短促清脆
{
  const buf = new Float32Array(Math.floor(SR * 0.42))
  mix(buf, tone(1318.51, 0.16, 0.20, { decay: 7, release: 0.05, harm: [1, 0.2] }), 0)
  mix(buf, tone(1760.0, 0.24, 0.16, { decay: 6, release: 0.09, harm: [1, 0.16] }), 0.075)
  save('ding.wav', buf)
}

// 超时：两声低音"咚咚"，比答错更沉一些（时间到了，不是做错了）
{
  const buf = new Float32Array(Math.floor(SR * 0.62))
  mix(buf, tone(261.63, 0.22, 0.22, { decay: 3.2, release: 0.12, harm: [1, 0.18] }), 0)
  mix(buf, tone(196.0, 0.30, 0.20, { decay: 2.6, release: 0.18, harm: [1, 0.14] }), 0.20)
  save('timeup.wav', buf)
}

// 心情小课堂的"再看看"：G4 -> C5 极轻的上行，慢起音、无锐利感
// 情绪模块里没有"错了"，所以既不用 wrong，也不用 ding（太抓注意力），只要一声软的
{
  const buf = new Float32Array(Math.floor(SR * 0.72))
  mix(buf, tone(392.0, 0.52, 0.15, { attack: 0.05, decay: 1.5, release: 0.24, harm: [1, 0.08] }), 0)
  mix(buf, tone(523.25, 0.48, 0.11, { attack: 0.06, decay: 1.6, release: 0.24, harm: [1, 0.06] }), 0.13)
  save('soft.wav', buf)
}

console.log('完成')
