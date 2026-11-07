/**
 * 语文识字 / 英语单词 引擎验证（Node 直接跑，不经 HBuilderX）
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 覆盖：
 *  1. 字表/词表完整性：60 条、唯一、主题分组均衡、必填字段非空
 *  2. 组卷：30 课 × 多轮，每轮 5 题，答案必须在选项里、选项不重复
 *  3. 题干不泄露答案（CN4/CN5 的"目标字可见"是设计如此，单列白名单）
 *  4. 填字题唯一性：正确字拼回去是真词，干扰字拼回去不是词
 *  5. 题型覆盖：cn1~cn6 / en1~en5 在 30 课内都必须出现
 *  6. 语文第 5 课 = 3 句字卡 + 2 题复习
 *  7. 颜色单元（T3）的听词题走色点选项，不是 emoji
 *  8. 免罚口径：语文英语所有题 soft=true
 */
import {
  CN_WORDS, CN_STORIES, cnCharsOfUnit, cnWordOf, cnStoryOf, cnThemeName, cnThemeOfUnit
} from './engine-tmp/cn-words.mts'
import {
  EN_WORDS, enWordsOfUnit, enWordOf, enSameSound, enFirstLetter, enThemeName
} from './engine-tmp/en-words.mts'
import {
  STUDY_ROUND_SIZE, TOTAL_LESSONS, lessonIndex, unitOfLesson, lessonOfUnit, isCorrectStudy
} from './engine-tmp/quiz.mts'
import { buildCnRound, cnLessonTitle } from './engine-tmp/cn-engine.mts'
import { buildEnRound, enLessonTitle } from './engine-tmp/en-engine.mts'

let failures = 0
function check(cond, msg) {
  if (!cond) {
    failures++
    if (failures <= 40) console.log('  ✗ ' + msg)
  }
}

/* ---------------- 1. 字表 ---------------- */

console.log('语文 60 字')
check(CN_WORDS.length === 60, '字表应为 60 个，实际 ' + CN_WORDS.length)

const cnSeen = new Set()
const cnEmoji = new Set()
for (const w of CN_WORDS) {
  check(w.ch.length === 1, '字应为单个汉字：' + w.ch)
  check(!cnSeen.has(w.ch), '字重复：' + w.ch)
  cnSeen.add(w.ch)
  check(w.word.indexOf(w.ch) >= 0, '组词里必须含这个字：' + w.ch + ' / ' + w.word)
  check(w.word.length >= 2 && w.word.length <= 3, '组词应为 2~3 字：' + w.word)
  check(w.emoji.length > 0, '缺 emoji：' + w.ch)
  check(!cnEmoji.has(w.emoji), 'emoji 重复：' + w.emoji + '（' + w.ch + '）')
  cnEmoji.add(w.emoji)
  check(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].indexOf(w.theme) >= 0, '主题非法：' + w.theme)
}
for (let u = 1; u <= 6; u++) {
  check(cnCharsOfUnit(u).length === 10, '第 ' + u + ' 单元应 10 字，实际 ' + cnCharsOfUnit(u).length)
}

/* 故事：每单元 3 句，且"大人念"的字不超过 1 个
 * 非灰字必须都在"当时已学"的字里——本单元 + 之前所有单元。
 * 第 5 课时 T1~T(unit-1) 都学完了，所以 T6 的故事里出现"我/鸟/门"是合法的。 */
for (const s of CN_STORIES) {
  check(s.sentences.length === 3, '第 ' + s.unit + ' 单元故事应 3 句，实际 ' + s.sentences.length)
  const learned = []
  for (let u = 1; u <= s.unit; u++) learned.push(...cnCharsOfUnit(u))
  for (const line of s.sentences) {
    const grey = (line.match(/\(/g) || []).length
    check(grey <= 1, '第 ' + s.unit + ' 单元单句超过 1 个大人念的字：' + line)
    const chars = line.replace(/[()|]/g, '').split('')
    for (const c of chars) {
      if (c.length === 0) continue
      const isGrey = new RegExp('\\(' + c + '\\)').test(line)
      if (isGrey) continue
      check(learned.indexOf(c) >= 0, '第 ' + s.unit + ' 单元故事用了当时还没学的字：' + c + '（' + line + '）')
    }
  }
}

/* ---------------- 1.5 emoji 兼容性 ---------------- */

/**
 * Android 7（电视盒子最常见的内核基线）只支持到 Unicode 9 的 emoji。
 * 下面这些都是 Unicode 10+ 里"很顺手但会显示豆腐块"的图，已经全部替换掉了，
 * 这条检查用来拦住以后又被加回来。
 */
const RISKY_EMOJI = ['🧑', '🥬', '🥩', '🦶', '🦷', '🧸', '🪁', '🪆', '🪨', '🪀', '🩰', '🫀', '🥯', '🧋']
for (const w of CN_WORDS) {
  check(RISKY_EMOJI.indexOf(w.emoji) < 0, '字表用了新 emoji（旧盒子显示豆腐块）：' + w.ch + ' → ' + w.emoji)
}
for (const w of EN_WORDS) {
  if (w.emoji.length === 0) continue
  check(RISKY_EMOJI.indexOf(w.emoji) < 0, '词表用了新 emoji（旧盒子显示豆腐块）：' + w.en + ' → ' + w.emoji)
}

/* ---------------- 2. 词表 ---------------- */

console.log('英语 60 词')
check(EN_WORDS.length === 60, '词表应为 60 个，实际 ' + EN_WORDS.length)

const enSeen = new Set()
const enEmoji = new Set()
for (const w of EN_WORDS) {
  check(w.en.length > 0, '英文词为空')
  check(!enSeen.has(w.en), '单词重复：' + w.en)
  enSeen.add(w.en)
  check(w.zh.length > 0, '缺中文：' + w.en)
  check(w.ipa.indexOf('/') === 0 && w.ipa.lastIndexOf('/') > 0, '音标格式应为 /.../：' + w.en + ' → ' + w.ipa)
  check(w.near.length > 0, '缺中文近似音（给家长的）：' + w.en)
  check(w.emoji.length > 0 || w.color.length > 0, '既没图也没色值：' + w.en)
  if (w.emoji.length > 0) {
    check(!enEmoji.has(w.emoji), 'emoji 重复：' + w.emoji + '（' + w.en + '）')
    enEmoji.add(w.emoji)
  }
  // 颜色主题必须有色值，其它主题不该有
  if (w.theme === 'T3') check(w.color.length > 0, '颜色词缺色值：' + w.en)
  else check(w.color.length === 0, '非颜色词不该有色值：' + w.en)
}
for (let u = 1; u <= 6; u++) {
  check(enWordsOfUnit(u).length === 10, '第 ' + u + ' 单元应 10 词，实际 ' + enWordsOfUnit(u).length)
}

/* ---------------- 3. 组卷 ---------------- */

/**
 * 题干是否泄露答案
 *
 * 注意：语文单字题的副标题是固定模板（"看图，选出这个字"），模板里可能恰好含某个
 * 答案字（如"上"出现在"图上"），所以**不能**用 subText.indexOf(answer) 来判——
 * 那样是误报。真正的泄露点是"题面出现了答案本身"，按题型逐条判：
 *   cn1 看图选字：题面必须是图，不能有字（有字就等于把答案写在脸上）
 *   cn3 听音找字：题面必须为空（这题的全部信息都在声音里）
 *   cn2/cn4/cn5：题面就是目标字/挖空词，属设计如此
 * 英语的副标题是中文模板、答案是 emoji 或英文词，两边不会撞，可以直接查。
 */
const VISIBLE_ANSWER_KINDS = new Set(['cn2', 'cn4', 'cn5'])

function checkRound(qs, label) {
  check(qs.length === STUDY_ROUND_SIZE, label + ' 应有 ' + STUDY_ROUND_SIZE + ' 题，实际 ' + qs.length)
  for (const q of qs) {
    check(q.answer.length > 0, label + ' 答案为空（' + q.kind + '）')
    check(q.options.indexOf(q.answer) >= 0, label + ' 答案不在选项里（' + q.kind + '）')
    check(q.prompt.length > 0, label + ' 题干为空（' + q.kind + '）')
    check(q.subText.length > 0, label + ' 副标题为空（' + q.kind + '）')
    check(q.soft === true, label + ' 语文英语所有题都应 soft=true（' + q.kind + '）')
    // 选项不重复
    const set = new Set(q.options)
    check(set.size === q.options.length, label + ' 选项重复（' + q.kind + '）：' + q.options.join('/'))

    if (q.kind === 'cn1') {
      check(q.mainText.length === 0, label + ' 看图选字的题面不该出现字（等于给出答案）')
      check(q.mainEmoji.length > 0, label + ' 看图选字缺题面图')
      check(q.layout === 'bigemoji', label + ' 看图选字应用大图布局')
    }
    if (q.kind === 'cn3') {
      check(q.layout === 'none', label + ' 听音找字的题面不能有内容（信息全在声音里）')
    }
    // 英语：副标题是中文模板，答案绝不会出现；出现了就是写错了
    if (q.mode === 'en' && !VISIBLE_ANSWER_KINDS.has(q.kind)) {
      check(q.subText.indexOf(q.answer) < 0, label + ' 英语副标题泄露答案（' + q.kind + '）：' + q.subText)
    }
  }
}

console.log('语文组卷 30 课 × 60 轮')
const cnKinds = new Set()
for (let level = 1; level <= TOTAL_LESSONS; level++) {
  for (let r = 0; r < 60; r++) {
    const qs = buildCnRound(level)
    checkRound(qs, 'cn L' + level)
    for (const q of qs) cnKinds.add(q.kind)
  }
}
for (const k of ['cn1', 'cn2', 'cn3', 'cn4', 'cn5', 'cn6']) {
  check(cnKinds.has(k), '题型未出现：' + k)
}

console.log('英语组卷 30 课 × 60 轮')
const enKinds = new Set()
for (let level = 1; level <= TOTAL_LESSONS; level++) {
  for (let r = 0; r < 60; r++) {
    const qs = buildEnRound(level)
    checkRound(qs, 'en L' + level)
    for (const q of qs) enKinds.add(q.kind)
  }
}
for (const k of ['en1', 'en2', 'en3', 'en4', 'en5']) {
  check(enKinds.has(k), '题型未出现：' + k)
}

/* ---------------- 4. 第 5 课 = 3 句字卡 + 2 题复习 ---------------- */

console.log('语文第 5 课结构')
for (let u = 1; u <= 6; u++) {
  const level = (u - 1) * 5 + 5
  const qs = buildCnRound(level)
  const stories = qs.filter((q) => q.kind === 'cn6')
  check(stories.length === 3, '第 ' + u + ' 单元第 5 课应有 3 句字卡，实际 ' + stories.length)
  check(qs.length === 5, '第 ' + u + ' 单元第 5 课应 5 题')
  for (const s of stories) {
    check(s.storyParts.length >= 3, '字卡句子太短：' + s.mainText)
    check(s.storyGreys.length === s.storyParts.length, '灰字标记与字数不一致：' + s.mainText)
    check(s.optionType === 'self', '字卡题应为自评按钮')
  }
}

/* ---------------- 5. 填字题唯一性 ---------------- */

console.log('填字题唯一性')
let fillCount = 0
// 扫所有课的题，收集 cn5，逐个验证"补回去是不是真词"
const realWords = new Set(CN_WORDS.map((w) => w.word))
function checkFill(q) {
  // 题面形如 "水（ ）"，答案必须能补成真词
  const left = q.mainText.split('（')[0]
  const right = q.mainText.split('）')[1] || ''
  check(realWords.has(left + q.answer + right), '填字题正确答案补回去不是真词：' + q.mainText + ' → ' + left + q.answer + right)
  for (const o of q.options) {
    if (o === q.answer) continue
    check(!realWords.has(left + o + right), '填字题有多个正确答案：' + q.mainText + ' 填 ' + o + ' 也成词')
  }
  fillCount++
}
for (let level = 1; level <= TOTAL_LESSONS; level++) {
  for (let r = 0; r < 30; r++) {
    for (const q of buildCnRound(level)) {
      if (q.kind === 'cn5') checkFill(q)
    }
  }
}
check(fillCount > 100, '填字题样本太少：' + fillCount)

/* ---------------- 6. 颜色单元走色点 ---------------- */

console.log('颜色单元（T3）')
for (let level = 11; level <= 15; level++) {
  for (let r = 0; r < 20; r++) {
    for (const q of buildEnRound(level)) {
      if (q.kind === 'en1') {
        check(q.optionType === 'color', '颜色单元的听词题应为色点选项，实际 ' + q.optionType)
        for (const o of q.options) {
          check(o.indexOf('#') === 0, '色点选项应是色值：' + o)
        }
      }
      if (q.kind === 'en2') {
        check(q.layout === 'colors', '颜色单元的看图选词题面应为色点')
        check(q.mainColor.length > 0, '颜色单元题面缺色值')
      }
    }
  }
}

/* ---------------- 7. 读题与标题 ---------------- */

console.log('读题与标题')
check(cnLessonTitle(1).indexOf('第 1 单元') >= 0, '语文课标题异常：' + cnLessonTitle(1))
check(enLessonTitle(11).indexOf('颜色') >= 0, '英语课标题异常：' + enLessonTitle(11))
// 跟读题必须用英文音
let sayIt = null
for (let level = 1; level <= TOTAL_LESSONS && sayIt == null; level++) {
  for (const q of buildEnRound(level)) {
    if (q.kind === 'en5') { sayIt = q; break }
  }
}
check(sayIt != null, '没抽到跟读题')
if (sayIt != null) {
  check(sayIt.speakLang === 'en-US', '跟读题应走 en-US，实际 ' + sayIt.speakLang)
  check(/^[a-z]+$/.test(sayIt.prompt), '跟读题的朗读文本应只有英文：' + sayIt.prompt)
}

/* 课序号换算：超过 30 课要循环回第 1 课 */
check(lessonIndex(1) === 1, 'lessonIndex(1) 应为 1')
check(lessonIndex(30) === 30, 'lessonIndex(30) 应为 30')
check(lessonIndex(31) === 1, 'lessonIndex(31) 应循环回 1')
check(unitOfLesson(1) === 1 && lessonOfUnit(1) === 1, '第 1 课换算错误')
check(unitOfLesson(30) === 6 && lessonOfUnit(30) === 5, '第 30 课换算错误')

/* 判定：严格相等 */
const fake = buildCnRound(1)[0]
check(isCorrectStudy(fake, fake.answer) === true, '判定：正确答案应通过')
check(isCorrectStudy(fake, fake.answer + 'x') === false, '判定：多一个字不应通过')

console.log('')
console.log(failures === 0 ? '✅ 三科引擎测试通过（语文 60 字 / 英语 60 词 / 30 课组卷）' : '❌ 共 ' + failures + ' 处问题')
process.exit(failures === 0 ? 0 : 1)
