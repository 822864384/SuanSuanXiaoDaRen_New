/**
 * 真人语音包验证
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 覆盖：
 *  1. voiceKey 稳定性（与 tools/voice-gen.py 必须逐位一致，否则音频全失配）
 *  2. 数字转中文边界（0/5/10/11/20）
 *  3. 数学题型短题干按模板拆分；长情境题整句回退系统 TTS，避免逐片拼接的断续感
 *  4. 拆出的片段：非空、无 emoji、无阿拉伯数字、无占位符残留
 *  5. 叫名字开场被正确剥离
 *  6. 语音包就绪时：所有片段都能在索引里找到（覆盖率的硬保证）
 */
import {
  voiceKey, hasVoice, numToCnText, voiceSegments, MATH_TPLS, tplFixedParts, NAME_HEADS
} from './engine-tmp/voice-tpl.mts'
import { VOICE_KEYS } from './engine-tmp/voice-index.mts'
import { genByKind } from './engine-tmp/math-engine.mts'
import { cleanForSpeech } from './engine-tmp/tts.mts'

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

/* ---------------- 1. key 稳定性 ---------------- */
// 这三个值由 tools/voice-gen.py 产出，硬编码作为"跨语言契约"。
// 一旦两边算法走偏，这里第一时间报，不会等到真机上"所有句子都没声音"才发现。
check(voiceKey('豆豆，请听题。') === 'v1e077efa', 'voiceKey 与 Python 不一致：豆豆，请听题。 -> ' + voiceKey('豆豆，请听题。'))
check(voiceKey('') === 'v00001505', 'voiceKey 空串应为 djb2 初值 5381(0x1505)：' + voiceKey(''))
check(voiceKey('苹') === voiceKey('苹'), 'voiceKey 不稳定')
check(voiceKey('苹果') !== voiceKey('苹'), 'voiceKey 撞了两个不同文本')

/* ---------------- 2. 数字 ---------------- */
check(numToCnText('0') === '零', '0 -> ' + numToCnText('0'))
check(numToCnText('5') === '五', '5 -> ' + numToCnText('5'))
check(numToCnText('10') === '十', '10 -> ' + numToCnText('10'))
check(numToCnText('11') === '十一', '11 -> ' + numToCnText('11'))
check(numToCnText('20') === '二十', '20 -> ' + numToCnText('20'))
check(numToCnText('苹果') === '苹果', '非数字应原样返回')
check(numToCnText(' 7 ') === '七', '带空格的数字')

/* ---------------- 3/4. 数学题干拆段 ---------------- */
const KINDS = [
  'count', 'take', 'conserve', 'neighbor', 'split', 'ordinal',
  'more3', 'longer', 'taller', 'weight', 'odd', 'pattern', 'add', 'sub'
]

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u
const ARABIC_RE = /[0-9]/

let segTotal = 0
let missing = new Set()

for (const kind of KINDS) {
  let okCount = 0
  for (let i = 0; i < 20; i++) {
    const q = genByKind(kind)
    // 演练真实朗读路径：「豆豆，请听题。{prompt}」
    const full = '豆豆，请听题。' + q.prompt
    const segs = voiceSegments(full)
    // 长情境加减题的片段过多，预期整句回退到系统 TTS，保证读题连贯。
    if (kind === 'add' || kind === 'sub') {
      check(segs.length === 0, kind + ' 长情境题应整句回退 TTS，实际：' + JSON.stringify(segs))
      continue
    }
    if (segs.length === 0) continue
    okCount++
    for (const s of segs) {
      check(s.length > 0, kind + ' 出现空片段')
      check(!EMOJI_RE.test(s), kind + ' 片段含 emoji：' + s)
      check(s.indexOf('{') < 0, kind + ' 片段残留占位符：' + s)
      // 数字必须已转中文：阿拉伯数字念出来是"five"或直接跳过
      if (s !== '从左边数' && s !== '从右边数') {
        check(!ARABIC_RE.test(s), kind + ' 片段含阿拉伯数字：' + s)
      }
    }
    segTotal += segs.length
    // 名字开场必须被剥离成独立第一段
    check(segs[0] === '豆豆，请听题。', kind + ' 第一段不是名字开场：' + segs[0])
  }
  if (kind !== 'add' && kind !== 'sub') {
    check(okCount >= 18, kind + ' 有题干拆不开（20 道里只有 ' + okCount + ' 道成功）')
  }
}

console.log('  数学题干共拆出 ' + segTotal + ' 个片段，平均 ' + (segTotal / (KINDS.length * 20)).toFixed(2) + ' 段/句')

/* ---------------- 5. 三种名字开场 ---------------- */
// 正文用"可拆的数学题干"，而不是随便一句——拆不开时整句回退 TTS 是**设计行为**，
// 因为半句真人半句机械比整句机械更难受，这里要测的是"能拆的时候名字有没有被剥掉"
const heads = [
  ['豆豆，请听题。', genByKind('count').prompt],
  ['滔滔，我们来看看这张图。', genByKind('count').prompt],
  ['小朋友，我们来看一个小故事。', genByKind('count').prompt]
]
for (const [h, body] of heads) {
  const segs = voiceSegments(h + body)
  check(segs.length >= 2 && segs[0] === h, '名字开场剥离失败：' + h + ' -> ' + JSON.stringify(segs))
}
check(NAME_HEADS.indexOf('豆豆') >= 0, 'NAME_HEADS 缺豆豆')
check(NAME_HEADS.indexOf('滔滔') >= 0, 'NAME_HEADS 缺滔滔')

/* 名字后面的正文拆不开时，整句必须整体放弃（不能只播一声"豆豆"就没了） */
const orphan = voiceSegments('豆豆，请听题。这句话题库里肯定没有')
check(orphan.length === 0, '正文拆不开时应整句回退，实际：' + JSON.stringify(orphan))

/* ---------------- 5b. 清洗后的文本必须还能拆 ---------------- */
// cleanForSpeech 曾经把中文问号删掉，导致「题干 key」与语音包全部失配——
// 表面现象是"明明生成了音频却没有真人音"。这条断言专门防它回归。
const cleaned = cleanForSpeech('豆豆，请听题。数一数，一共有几个苹果呀？')
check(cleaned.indexOf('？') > 0, 'cleanForSpeech 不该删中文问号：' + cleaned)
const cleanSeg = voiceSegments(cleaned)
check(cleanSeg.length > 1, '清洗后的题干拆不开：' + JSON.stringify(cleanSeg))

/* ---------------- 6. 语音包覆盖率 ---------------- */
if (VOICE_KEYS.length === 0) {
  console.log('  ⚠ 语音包为空（未生成或未跑索引），跳过覆盖率检查')
} else {
  // 所有模板固定串必须都已录：漏一个，整类题就退回机械音
  for (const p of tplFixedParts()) {
    if (!hasVoice(p)) missing.add('固定串 ' + p)
  }
  for (let n = 0; n <= 20; n++) {
    const w = numToCnText(String(n))
    if (!hasVoice(w)) missing.add('数字 ' + w)
  }
  for (const kind of KINDS) {
    for (let i = 0; i < 5; i++) {
      const q = genByKind(kind)
      for (const s of voiceSegments('豆豆，请听题。' + q.prompt)) {
        if (!hasVoice(s)) missing.add(kind + ' 片段 ' + s)
      }
    }
  }
  if (missing.size > 0) {
    const arr = Array.from(missing).slice(0, 12)
    check(false, '语音包缺 ' + missing.size + ' 段：' + arr.join(' / '))
  } else {
    check(true, '')
    console.log('  语音包覆盖：模板片段全覆盖（' + VOICE_KEYS.length + ' 条音频）')
  }
}

console.log('\nvoice.test: ' + pass + ' 通过, ' + fail + ' 失败')
if (fail > 0) process.exit(1)
