/**
 * 开场白测试（2026-11-09 §33）
 *
 * 覆盖：
 *  1. 开场白行数与内容（固定文案，含名字嘱咐、求助渠道）
 *  2. 每行非空、无 emoji（朗读前统一清洗的前提是不藏表情符号）
 *  3. 行间留白 > 0（嘱咐话要一行一顿）
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  INTRO_LINES, INTRO_LINE_GAP_MS, INTRO_SPEED, INTRO_RATE_CAP,
  setIntroTarget, takeIntroTarget
} from './engine-tmp/intro-say.mts'
import { hasVoice, voiceKey } from './engine-tmp/voice-tpl.mts'

let pass = 0
let fail = 0

function check(cond: boolean, msg: string): void {
  if (cond) {
    pass++
  } else {
    fail++
    console.error('  ✗ ' + msg)
  }
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/u

check(INTRO_LINES.length === 5, '开场白应为 5 行，实际 ' + INTRO_LINES.length)
check(INTRO_LINES[0].indexOf('学习时间') >= 0, '第 1 行应点题"学习时间"')
check(INTRO_LINES[2].indexOf('桂允滔') >= 0, '第 3 行应点名"桂允滔"')
check(INTRO_LINES[4].indexOf('爸爸妈妈') >= 0, '第 5 行应说明求助渠道（爸爸妈妈）')

for (let i = 0; i < INTRO_LINES.length; i++) {
  const line = INTRO_LINES[i].trim()
  check(line.length > 0, '第 ' + (i + 1) + ' 行不应为空')
  check(!EMOJI.test(line), '第 ' + (i + 1) + ' 行不应含 emoji：' + line)
}

check(INTRO_LINE_GAP_MS > 0 && INTRO_LINE_GAP_MS <= 1000, '行间留白应在 (0,1000]，实际 ' + INTRO_LINE_GAP_MS)

/* ---------- 目标模块中转（首页 → 规则页 → 答题页，不用页面参数） ---------- */
check(takeIntroTarget() === '', '初始应无目标')
setIntroTarget('math')
check(takeIntroTarget() === 'math', '应取回 math')
check(takeIntroTarget() === '', '目标应取走即清空（防重复跳转）')
setIntroTarget('en')
setIntroTarget('cn')
check(takeIntroTarget() === 'cn', '重复设置应以后一次为准')

/* ---------- 开场白必须全部有真人音频 ----------
 * 用户要求「开场白这段话都使用真人音频」：任何一句改台词后没重跑
 * tools/voice-script.mjs + voice-gen.py，这里直接红，避免运行时悄悄退回机器音。
 */
const voiceDir = path.join(import.meta.dirname, '..', 'static', 'voice')
for (let i = 0; i < INTRO_LINES.length; i++) {
  const line = INTRO_LINES[i]
  const k = voiceKey(line)
  check(hasVoice(line), '第 ' + (i + 1) + ' 句不在语音包索引里：' + line)
  check(fs.existsSync(path.join(voiceDir, k + '.mp3')), '第 ' + (i + 1) + ' 句音频文件缺失：' + k + '.mp3')
}

/* ---------- 开场白语速：要比默认快，但不能快到听不清 ----------
 * 用户 2026-11-09 反馈开场白读得太慢，要求读快一点。
 * 语速只放宽"开场白"这一段：念题目、念选项仍守 1.24，不跟着变快。
 */
check(INTRO_SPEED > 1.0, '开场白应比默认语速快，实际 ' + INTRO_SPEED)
check(INTRO_SPEED <= 1.3, '开场白语速不宜超过 1.3（再快孩子听不清字），实际 ' + INTRO_SPEED)
check(INTRO_RATE_CAP > 1.24 && INTRO_RATE_CAP <= 1.5, '开场白倍速上限应放宽到 (1.24, 1.5]，实际 ' + INTRO_RATE_CAP)

const voiceMod = await import('./engine-tmp/voice.mts')
check(voiceMod.voiceRateCap() === 1.24, '默认倍速上限应为 1.24，实际 ' + voiceMod.voiceRateCap())
voiceMod.setVoiceRateCap(INTRO_RATE_CAP)
check(voiceMod.voiceRateCap() === INTRO_RATE_CAP, '放宽后上限应为 ' + INTRO_RATE_CAP)
voiceMod.setVoiceRateCap(0)
check(voiceMod.voiceRateCap() === 1.24, '传 0 应复位到 1.24，实际 ' + voiceMod.voiceRateCap())
voiceMod.setVoiceRateCap(9)
check(voiceMod.voiceRateCap() === 1.5, '越界上限应夹到 1.5，实际 ' + voiceMod.voiceRateCap())
voiceMod.setVoiceRateCap(0.5)
check(voiceMod.voiceRateCap() === 1.24, '低于默认的设定不应把上限压低，实际 ' + voiceMod.voiceRateCap())
voiceMod.setVoiceRateCap(0)

console.log('开场白测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail > 0) process.exit(1)
