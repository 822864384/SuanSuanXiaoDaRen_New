/**
 * 英语单词模块 · 朗读稿验证
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 这一组守的是 2026-11-07 真机上暴露的故障：**只说了"请听题"，题目内容一个字都没念**。
 * 根因不是播放，是朗读稿本身——旧版本把「cat，小猫，哪个是cat？」整句交给英文音色合成，
 * 英文音色把中文整段吞掉，音频里只剩 "cat cat"。所以这里既查稿子，也查"稿子和音色对不对得上"。
 *
 * 覆盖：
 *  1. 结构：开场 + 一遍（英文词读两遍）+ 过渡句（有可读选项才有）
 *  2. 节奏：两遍词之间恰好 700ms「稍微停顿」，别处都是短线留白
 *  3. 语言纯净：中文行不许含拉丁字母，英文行只许有字母空格（混排就是旧 bug 的根）
 *  4. 音色对齐：稿子里的每种语言，语音包里的合成音色必须匹配（zh→中文音色，en→英文音色）
 *  5. 覆盖率：英语模块会念到的每一行都真有音频（漏一句就会退回机械音）
 */
import fs from 'node:fs'
import path from 'node:path'
import { enNarration, enPass, enNumWord, EN_TWICE_GAP_MS, EN_OPTIONS_LEAD, EN_NUM_WORDS } from './engine-tmp/en-say.mts'
import { buildEnRound } from './engine-tmp/en-engine.mts'
import { voiceKey, NAME_HEADS } from './engine-tmp/voice-tpl.mts'
import { VOICE_KEYS } from './engine-tmp/voice-index.mts'

let pass = 0
let fail = 0
function check(ok, msg) {
  if (ok) {
    pass++
  } else {
    fail++
    console.log('  ✗ ' + msg)
  }
}

const LATIN = /[A-Za-z]/
const HAN = /[\u4e00-\u9fff]/
const LATIN_ONLY = /^[A-Za-z ]+$/

/** 全部英语题（30 课 × 60 轮，取不重复的题干组合足够） */
const questions = []
for (let lv = 1; lv <= 30; lv++) {
  for (let r = 0; r < 20; r++) {
    for (const q of buildEnRound(lv)) questions.push(q)
  }
}
console.log('英语题样本 ' + questions.length + ' 道')

/* ---------------- 1 & 2. 结构与节奏 ---------------- */

const heads = new Set()
const kindsSeen = new Set()
let maxLines = 0
for (const q of questions) {
  // 选项会被念出来的只有 en2/en3（词卡）；en1 图卡、en4 数字卡、en5 跟读不念选项
  const willRead = q.kind === 'en2' || q.kind === 'en3'
  const nar = enNarration('豆豆', q, false, willRead)
  const one = enPass(q)
  // 一遍 = 英文词两遍 + 中文引导；en4 数词联动是「数字/名词」整组两遍 + 提问
  const expectPass = q.kind === 'en4' ? 5 : 3
  check(one.texts.length === expectPass, q.kind + ' 一遍应为 ' + expectPass + ' 行，实际 ' + one.texts.length)
  const expectTotal = 1 + expectPass + (willRead ? 1 : 0)
  check(nar.texts.length === expectTotal,
    q.kind + ' 总行数应为「开场 + 一遍' + (willRead ? ' + 过渡句' : '') + '」，实际 ' + nar.texts.length)
  check(nar.texts[0] === '豆豆，请听题。', q.kind + ' 开场不对：' + nar.texts[0])
  check(nar.langs[0] === 'zh-CN', q.kind + ' 开场应该是中文音色')
  check(nar.texts.length === nar.langs.length && nar.texts.length === nar.gaps.length,
    q.kind + ' texts/langs/gaps 长度不一致：' + nar.texts.length + '/' + nar.langs.length + '/' + nar.gaps.length)
  if (nar.texts.length > maxLines) maxLines = nar.texts.length
  heads.add(nar.texts[0])
  kindsSeen.add(q.kind)

  // 英文内容必须恰好读两遍、连着出现，且两遍之间是「稍微停顿」（700ms）
  // en4 是「数字/名词」整组两遍（4 行英文），其余题型是单词两遍（2 行英文）
  const enIdx = []
  for (let i = 0; i < nar.texts.length; i++) {
    if (nar.langs[i] === 'en-US') enIdx.push(i)
  }
  const half = enIdx.length / 2
  check(enIdx.length >= 2 && enIdx.length % 2 === 0,
    q.kind + ' 英文行应为偶数（整组两遍），实际 ' + enIdx.length)
  if (enIdx.length >= 2 && enIdx.length % 2 === 0) {
    // 两半内容完全一致：第二遍就是第一遍原样复读
    let same = true
    for (let h = 0; h < half; h++) {
      if (nar.texts[enIdx[h]] !== nar.texts[enIdx[half + h]]) same = false
    }
    check(same, q.kind + ' 第二遍英文与第一遍不一致')
    // 停顿落在第一半的最后一行之后
    check(nar.gaps[enIdx[half - 1]] === EN_TWICE_GAP_MS,
      q.kind + ' 两遍之间的停顿应为 ' + EN_TWICE_GAP_MS + 'ms，实际 ' + nar.gaps[enIdx[half - 1]])
    // 单词型题型两遍必须紧挨着；en4 组内数字/名词贴得近（180ms），组间才是 700ms
    if (enIdx.length === 2) {
      check(enIdx[1] === enIdx[0] + 1, q.kind + ' 两遍英文词必须紧挨着，实际下标 ' + enIdx[0] + ',' + enIdx[1])
    }
  }

  // 过渡句：有可读选项才出现，且必须是最后一行
  const leadIdx = nar.texts.indexOf(EN_OPTIONS_LEAD)
  if (willRead) {
    check(leadIdx === nar.texts.length - 1 && leadIdx > 0,
      q.kind + ' 过渡句应恰好是最后一行，实际下标 ' + leadIdx)
    check(nar.langs[leadIdx] === 'zh-CN', q.kind + ' 过渡句应是中文音色')
  } else {
    check(leadIdx < 0, q.kind + ' 没有可读选项，不应出现过渡句')
  }

  // 不念选项时行为一致：过渡句绝不出现
  const narNo = enNarration('豆豆', q, false, false)
  check(narNo.texts.indexOf(EN_OPTIONS_LEAD) < 0, q.kind + ' willReadOptions=false 不应出现过渡句')
  check(narNo.texts.length === 1 + expectPass, q.kind + ' willReadOptions=false 行数应为 ' + (1 + expectPass))
}
check(heads.size === 1, '开场应当只有一种：' + Array.from(heads).join('/'))
check(kindsSeen.size === 5, '五种英语题型都应出过朗读稿，实际 ' + Array.from(kindsSeen).join('/'))
console.log('  最长朗读稿 ' + maxLines + ' 行')

/* ---------------- 3. 语言纯净 ---------------- */

for (const q of questions) {
  const nar = enNarration('豆豆', q, false, q.kind === 'en2' || q.kind === 'en3')
  for (let i = 0; i < nar.texts.length; i++) {
    const t = nar.texts[i]
    const isEn = nar.langs[i] === 'en-US'
    if (isEn) {
      check(LATIN_ONLY.test(t), q.kind + ' 英文行混进了别的字符：' + t)
      check(!HAN.test(t), q.kind + ' 英文行含汉字（旧 bug 的根：英文音色会把中文吞掉）：' + t)
    } else {
      check(!LATIN.test(t), q.kind + ' 中文行含拉丁字母（中文音色会念歪）：' + t)
      check(HAN.test(t), q.kind + ' 中文行为空或没有汉字：' + t)
    }
  }
}

/* ---------------- 4. 音色对齐（用生成脚本的清单反查） ---------------- */

const scriptPath = path.resolve(import.meta.dirname, '..', 'tools', 'voice-script.json')
let script = null
try {
  script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'))
} catch (e) {
  console.log('  ⚠ 读不到 tools/voice-script.json，跳过音色对齐检查')
}
if (script != null) {
  const byText = new Map()
  for (const it of script.items) byText.set(it.text, it)
  let aligned = 0
  for (const q of questions) {
    const nar = enNarration('豆豆', q, false, q.kind === 'en2' || q.kind === 'en3')
    for (let i = 0; i < nar.texts.length; i++) {
      const it = byText.get(nar.texts[i])
      if (it == null) {
        check(false, q.kind + ' 朗读稿不在语音生成清单里：' + nar.texts[i])
        continue
      }
      const wantEn = nar.langs[i] === 'en-US'
      check(it.lang === nar.langs[i], q.kind + ' 合成语言与朗读语言不一致：' + nar.texts[i] + ' 生成用 ' + it.lang)
      check((it.role === 'en') === wantEn, q.kind + ' 音色角色不对：' + nar.texts[i] + ' role=' + it.role)
      aligned++
    }
  }
  console.log('  音色对齐检查 ' + aligned + ' 行')
}

// 英文数字（数词题的选项）也要在清单里，且必须是英文角色
for (const n of EN_NUM_WORDS) {
  check(n.length > 0, '英文数字为空')
  if (script != null) {
    const it = script.items.find((x) => x.text === n)
    check(it != null && it.role === 'en' && it.lang === 'en-US', '英文数字没进清单或音色不对：' + n)
  }
}
check(enNumWord('3') === 'three', 'enNumWord("3") 应为 three，实际 ' + enNumWord('3'))
check(enNumWord('0') === 'zero', 'enNumWord("0") 应为 zero')
check(enNumWord('9') === '9', '超出 0~5 的数字应原样返回')

/* ---------------- 5. 覆盖率：每一行都真有音频 ---------------- */

if (VOICE_KEYS.length === 0) {
  console.log('  ⚠ 语音包为空，跳过覆盖率检查')
} else {
  const missing = new Set()
  for (const q of questions) {
    const nar = enNarration('豆豆', q, false, q.kind === 'en2' || q.kind === 'en3')
    for (const t of nar.texts) {
      if (VOICE_KEYS.indexOf(voiceKey(t)) < 0) missing.add(t)
    }
  }
  if (VOICE_KEYS.indexOf(voiceKey(EN_OPTIONS_LEAD)) < 0) missing.add(EN_OPTIONS_LEAD)
  for (const n of NAME_HEADS) {
    const t = n + '，请听题。'
    if (VOICE_KEYS.indexOf(voiceKey(t)) < 0) missing.add(t)
  }
  if (missing.size > 0) {
    console.log('  ✗ 缺音频 ' + missing.size + ' 条：' + Array.from(missing).slice(0, 6).join(' | '))
    fail++
  } else {
    pass++
    console.log('  英语朗读稿 100% 有真人音频')
  }
}

console.log('英语朗读稿：' + pass + ' 通过，' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
