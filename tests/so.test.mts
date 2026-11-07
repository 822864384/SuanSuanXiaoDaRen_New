/**
 * 交往剧场（人际交往启蒙）验证（Node 直接跑，不经 HBuilderX）
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 覆盖：
 *  1. 剧集完整性：id 唯一、类别合法、分镜/选项/跟读/家长话术都不缺
 *  2. 一集只教一句话：phrase 短、能一口气说完；每集都有且只有一句
 *  3. 文案红线：不贴标签、不出现"错"字、不宣称疗效
 *  4. 判定与推进：good/other 两档、下一集优先没演过、全演完从头来
 *  5. 称号与总结：7 颗星给小达人、总结里必须带那句话
 *  6. 读剧本文案：开场"我们来看一个小故事"、提问直接叫名字
 *  7. emoji 基线：不许用 Unicode 10+（Android 7 盒子会显示豆腐块）
 */
import {
  SO_EPISODES, SO_THEMES, SO_BADGE_STARS, SO_GOOD, SO_OTHER,
  episodesOf, soThemeOf, episodeOf, soProgressOf, soDoneCount,
  nextEpisode, judgeSo, soPraise, soOtherOpen, soTitleOf, soSummary
} from './engine-tmp/so.mts'
import { soOpenSpeech, soAskSpeech } from './engine-tmp/tts.mts'

let bad = 0
function check(cond, msg) {
  if (!cond) {
    bad++
    console.log('  ✗ ' + msg)
  }
}

/** 文本里有没有 emoji（旁白只该是纯文字，图形走 emoji 字段） */
function hasEmoji(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) return true
    if (c >= 0x2600 && c <= 0x27bf) return true
    if (c >= 0x2b00 && c <= 0x2bff) return true
  }
  return false
}

/** 去掉开头的图形，只留文字：'👋 老师好' → '老师好' */
function bareText(s) {
  let i = 0
  while (i < s.length) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdfff) { i += 1; continue }
    if (c >= 0x2600 && c <= 0x27bf) { i += 1; continue }
    if (c >= 0x2b00 && c <= 0x2bff) { i += 1; continue }
    if (c >= 0xfe00 && c <= 0xfe0f) { i += 1; continue }
    if (c === 0x20) { i += 1; continue }
    break
  }
  return s.slice(i)
}

/* ---------------- 1. 类别与剧集完整性 ---------------- */

console.log('交往剧场 4 类 12 集')
check(SO_THEMES.length === 4, '类别应为 4 个，实际 ' + SO_THEMES.length)
check(SO_EPISODES.length === 12, '剧集应为 12 集，实际 ' + SO_EPISODES.length)

const themeIds = SO_THEMES.map((t) => t.id)
for (const t of SO_THEMES) {
  check(t.emoji.length > 0, t.id + ' 缺 emoji')
  check(t.name.length > 0, t.id + ' 缺名称')
  check(t.sub.length > 0, t.id + ' 缺副标题')
  // 每类至少 3 集：大厅那一排正好放三张，少于 3 会显得很空
  check(episodesOf(t.id).length >= 3, t.id + ' 不足 3 集')
}

const idSeen = new Set()
const phraseSeen = new Set()
for (const e of SO_EPISODES) {
  check(/^S[1-4]-\d$/.test(e.id), '剧集 id 格式应为 S1-1：' + e.id)
  check(!idSeen.has(e.id), '剧集 id 重复：' + e.id)
  idSeen.add(e.id)
  check(themeIds.indexOf(e.theme) >= 0, e.id + ' 的类别不存在：' + e.theme)
  check(e.title.length > 0 && e.title.length <= 8, e.id + ' 标题应为 1~8 字：' + e.title)
  check(e.place.length > 0 && e.place.length <= 8, e.id + ' 场景标签应为 1~8 字：' + e.place)
  check(e.ask.length > 0 && e.ask.length <= 20, e.id + ' 提问应为 1~20 字：' + e.ask)
  check(e.demo.length > 0 && e.demo.length <= 34, e.id + ' 示范句缺失或过长：' + e.demo)
  check(e.parentTip.length > 0 && e.parentTip.length <= 50, e.id + ' 家长话术缺失或过长：' + e.parentTip)

  /* 分镜：2~3 帧，一帧一句，旁白不含 emoji */
  check(e.beats.length >= 2 && e.beats.length <= 3, e.id + ' 分镜应为 2~3 帧，实际 ' + e.beats.length)
  for (const b of e.beats) {
    check(b.emoji.length > 0, e.id + ' 有分镜缺图形')
    check(b.text.length > 0 && b.text.length <= 22, e.id + ' 分镜旁白应为 1~22 字：' + b.text)
    check(!hasEmoji(b.text), e.id + ' 分镜旁白里混了 emoji（会读出怪声）：' + b.text)
  }

  /* 选项：3 个、不重复、至少一个好做法 */
  check(e.options.length === 3, e.id + ' 选项应为 3 个，实际 ' + e.options.length)
  const optSeen = new Set()
  let goodCount = 0
  for (const o of e.options) {
    const word = bareText(o.text)
    check(word.length > 0 && word.length <= 10, e.id + ' 选项文字应为 1~10 字：' + o.text)
    check(!optSeen.has(word), e.id + ' 选项重复：' + o.text)
    optSeen.add(word)
    check(o.after.length > 0, e.id + ' 选项「' + word + '」没有结果描述')
    check(o.after.length <= 40, e.id + ' 选项「' + word + '」的结果太长（一屏放不下）：' + o.after)
    if (o.good) goodCount++
  }
  check(goodCount >= 1, e.id + ' 没有好做法（这一集无法演到好结局）')
  check(goodCount < e.options.length, e.id + ' 三个选项都是好做法（就没有"另一种样子"了）')

  /* 跟读：一集一句，短到能一口气说完，不带标点 */
  check(e.phrase.length > 0 && e.phrase.length <= 7, e.id + ' 跟读句应为 1~7 字：' + e.phrase)
  check(!/[，。！？、,.!?]/.test(e.phrase), e.id + ' 跟读句不该带标点：' + e.phrase)
  check(!phraseSeen.has(e.phrase), '跟读句重复（一集只教一句新的）：' + e.phrase)
  phraseSeen.add(e.phrase)
  check(e.phraseTip.length > 0 && e.phraseTip.length <= 22, e.id + ' 跟读提示应为 1~22 字：' + e.phraseTip)
}

/* ---------------- 2. 文案红线 ---------------- */

console.log('文案红线')
const BANNED = ['焦虑', '内向', '多动', '胆小', '磨蹭', '拖拉', '懒', '诊断', '治疗', '治愈', '疗效', '失败', '错']
const allText = []
for (const e of SO_EPISODES) {
  allText.push(e.title, e.place, e.ask, e.demo, e.phrase, e.phraseTip, e.parentTip)
  for (const b of e.beats) allText.push(b.text)
  for (const o of e.options) allText.push(o.text, o.after)
}
for (const t of SO_THEMES) allText.push(t.name, t.sub)
for (const s of allText) {
  for (const w of BANNED) {
    if (s.indexOf(w) >= 0) check(false, '儿童端出现禁用词「' + w + '」：' + s)
  }
}

/* ---------------- 3. 判定与推进 ---------------- */

console.log('判定与推进')
for (const e of SO_EPISODES) {
  let good = 0
  for (const o of e.options) {
    const v = judgeSo(o)
    check(v === SO_GOOD || v === SO_OTHER, e.id + ' 判定只应有 good/other，实际 ' + v)
    if (v === SO_GOOD) good++
  }
  check(good >= 1, e.id + ' 判定后没有 good 分支')
}
check(soPraise().length > 0, '缺少好结局的夸奖语')
check(soOtherOpen().length > 0, '缺少另一种结果的开场语')
check(soOtherOpen().indexOf('错') < 0, '另一种结果的开场里出现了"错"字')

const s1 = episodesOf('S1')
check(s1.length === 3, 'S1 应有 3 集')
check(nextEpisode('S1', []).id === 'S1-1', '都没演过时应从第一集开始')
check(nextEpisode('S1', ['S1-1']).id === 'S1-2', '演过第一集后应排第二集')
check(nextEpisode('S1', ['S1-1', 'S1-2', 'S1-3']).id === 'S1-1', '全演完应回到第一集')
check(nextEpisode('S9', []).id === SO_EPISODES[0].id, '未知类别应兜底返回第一集')
check(soProgressOf('S1', ['S1-1', 'S2-1']) === 1, 'S1 进度只该算 S1 的集')
check(soDoneCount(['S1-1', 'S2-1', '不认识']) === 2, '总集数只该算清单里有的')
check(episodeOf('S4-3').id === 'S4-3', 'episodeOf 取不到指定集')
check(episodeOf('不存在').id === SO_EPISODES[0].id, 'episodeOf 未知 id 应兜底第一集')
check(soThemeOf('S3').id === 'S3', 'soThemeOf 取不到指定类别')
check(soThemeOf('不存在').id === SO_THEMES[0].id, 'soThemeOf 未知 id 应兜底第一个')

/* ---------------- 4. 称号与总结 ---------------- */

console.log('称号与总结')
check(SO_BADGE_STARS === 7, '称号门槛应为设计文档定的 7 颗')
check(soTitleOf(0).length > 0, '0 颗星没有称号')
check(soTitleOf(3) !== soTitleOf(7), '3 颗和 7 颗的称号应该不同')
check(soTitleOf(7).indexOf('小达人') >= 0, '满 7 颗应给"小达人"称号')

const ep1 = SO_EPISODES[0]
const sumGood = soSummary(ep1, true)
const sumOther = soSummary(ep1, false)
check(sumGood.indexOf(ep1.phrase) >= 0, '好结局总结里应带上那句话')
check(sumOther.indexOf(ep1.phrase) >= 0, '另一种结局总结里也应带上那句话')
check(sumGood !== sumOther, '两种结局的总结应该不同')

/* ---------------- 5. 读剧本文案 ---------------- */

console.log('读剧本文案')
const open = soOpenSpeech('豆豆', '早上，糖豆来到幼儿园门口')
check(open.indexOf('豆豆') === 0, '开场应先叫名字：' + open)
check(open.indexOf('小故事') >= 0, '开场应说"我们来看一个小故事"：' + open)
check(open.indexOf('请听题') < 0, '交往剧场不该用考试的口气（请听题）：' + open)
check(soOpenSpeech('', 'x').indexOf('小朋友') === 0, '没名字时应兜底"小朋友"')
check(soAskSpeech('豆豆', '糖豆可以说什么呀？') === '豆豆，糖豆可以说什么呀？', '提问文案格式不对')
check(soAskSpeech('', 'x') === '小朋友，x', '没名字时提问应兜底"小朋友"')
check(soAskSpeech('豆豆', '') === '', '没提问时应返回空串（不朗读）')

/* ---------------- 6. emoji 基线 ---------------- */

console.log('emoji 基线（Android 7 = Unicode 9）')
const RISKY = [
  '🧑', '🧩', '🧍', '🧎', '🧱', '🥬', '🥩', '🥯', '🧋', '🧸', '🪁', '🪆', '🪨', '🪀', '🩰', '🫀', '🫶', '🦶', '🦷'
]
for (const e of SO_EPISODES) {
  for (const b of e.beats) {
    check(RISKY.indexOf(b.emoji) < 0, e.id + ' 分镜用了新 emoji（旧盒子显示豆腐块）：' + b.emoji)
  }
  for (const o of e.options) {
    const head = o.text.slice(0, 4)
    for (const w of RISKY) {
      check(head.indexOf(w) < 0, e.id + ' 选项用了新 emoji：' + o.text)
    }
  }
}
for (const t of SO_THEMES) {
  check(RISKY.indexOf(t.emoji) < 0, t.id + ' 类别用了新 emoji：' + t.emoji)
}

console.log(bad === 0 ? '✅ 交往剧场测试通过（4 类 12 集）' : '❌ 交往剧场测试：' + bad + ' 处问题')
process.exit(bad === 0 ? 0 : 1)
