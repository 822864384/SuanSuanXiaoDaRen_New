/**
 * 小黑板讲解验证（Node 直接跑，不经 HBuilderX）
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 覆盖：
 *  1. 覆盖面：14 个题型每道题都必须有讲解（答错时不能出现空黑板）
 *  2. 结构：3~5 步、每步板书与口述都非空、表情合法
 *  3. 排版：板书 ≤ 26 字、口述 ≤ 48 字（黑板一行放得下、一口气说得完）
 *  4. 落点：最后一步必须把正确答案写出来（board + icon 合起来含答案）
 *  5. 红线：不出现"错"字与标签词，讲解不评价孩子
 *  6. emoji：讲解里用的 emoji 必须在 Android 7（Unicode 9）基线内
 */
import {
  genByKind, KIND_COUNT, KIND_TAKE, KIND_CONSERVE, KIND_NEIGHBOR, KIND_SPLIT,
  KIND_ORDINAL, KIND_MORE3, KIND_LONGER, KIND_TALLER, KIND_WEIGHT, KIND_ODD,
  KIND_PATTERN, KIND_ADD, KIND_SUB,
  KIND_NEXTNUM, KIND_PATTERN2, KIND_HALF, KIND_ANALOGY, KIND_CAUSE, KIND_DAYTIME, KIND_NOTCAT
} from './engine-tmp/math-engine.mts'

let bad = 0
function check(cond, msg) {
  if (!cond) {
    bad++
    if (bad <= 40) console.log('  ✗ ' + msg)
  }
}

const KINDS = [
  KIND_COUNT, KIND_TAKE, KIND_CONSERVE, KIND_NEIGHBOR, KIND_SPLIT, KIND_ORDINAL,
  KIND_MORE3, KIND_LONGER, KIND_TALLER, KIND_WEIGHT, KIND_ODD, KIND_PATTERN,
  KIND_ADD, KIND_SUB,
  KIND_NEXTNUM, KIND_PATTERN2, KIND_HALF, KIND_ANALOGY, KIND_CAUSE, KIND_DAYTIME, KIND_NOTCAT
]

/** Android 7 只到 Unicode 9：更晚的 emoji 在旧电视盒子上是豆腐块 */
const RISKY_EMOJI = [
  '🧑', '🥬', '🥩', '🦶', '🦷', '🧸', '🪁', '🪆', '🪨', '🪀', '🩰', '🫀', '🥯', '🧋',
  '🪶', '🦺', '🧉', '🦣', '🫐', '🥷', '🩸', '🍋', '🫧', '🪴'
]
const FACES = ['🤔', '🙂', '😊']
/** 讲解里禁止出现的词：不评价孩子、不贴标签 */
const BANNED = ['错', '失败', '笨', '傻', '差劲', '不对', '粗心', '马虎']

function bannedIn(text) {
  for (const w of BANNED) {
    if (text.indexOf(w) >= 0) return w
  }
  return ''
}

function riskyIn(text) {
  for (const e of RISKY_EMOJI) {
    if (text.indexOf(e) >= 0) return e
  }
  return ''
}

console.log('题型：' + KINDS.length + ' 个，每型抽 200 道')

let minSteps = 99
let maxSteps = 0
let maxBoard = 0
let maxSay = 0
let titleSeen = new Set()

for (const kind of KINDS) {
  for (let i = 0; i < 200; i++) {
    const q = genByKind(kind)
    const ex = q.explain
    const tag = kind + '#' + i

    // 1. 必须有讲解
    check(ex.lines.length > 0, tag + ' 没有讲解')
    if (ex.lines.length === 0) continue
    check(ex.title.length > 0, tag + ' 讲解缺标题')
    titleSeen.add(ex.title)

    // 2. 结构
    check(ex.lines.length >= 3, tag + ' 讲解只有 ' + ex.lines.length + ' 步（至少 3 步才讲得清）')
    check(ex.lines.length <= 5, tag + ' 讲解 ' + ex.lines.length + ' 步（超过 5 步孩子坐不住）')
    if (ex.lines.length < minSteps) minSteps = ex.lines.length
    if (ex.lines.length > maxSteps) maxSteps = ex.lines.length

    const boards = new Set()
    for (let s = 0; s < ex.lines.length; s++) {
      const l = ex.lines[s]
      check(l.board.length > 0, tag + ' 第 ' + (s + 1) + ' 步板书为空')
      check(l.say.length > 0, tag + ' 第 ' + (s + 1) + ' 步没话可说')
      check(FACES.indexOf(l.face) >= 0, tag + ' 第 ' + (s + 1) + ' 步表情不合法：' + l.face)
      // 3. 排版
      check(l.board.length <= 26, tag + ' 板书过长（' + l.board.length + ' 字）：' + l.board)
      check(l.say.length <= 48, tag + ' 口述过长（' + l.say.length + ' 字）：' + l.say)
      if (l.board.length > maxBoard) maxBoard = l.board.length
      if (l.say.length > maxSay) maxSay = l.say.length
      check(!boards.has(l.board), tag + ' 第 ' + (s + 1) + ' 步板书与前面重复：' + l.board)
      boards.add(l.board)
      // 5/6. 红线与 emoji
      const b1 = bannedIn(l.board + l.say)
      check(b1 === '', tag + ' 讲解出现禁用词「' + b1 + '」')
      const r1 = riskyIn(l.board + l.say + l.icon)
      check(r1 === '', tag + ' 讲解用了超基线 emoji：' + r1)
    }
    const t1 = bannedIn(ex.title)
    check(t1 === '', tag + ' 讲解标题出现禁用词「' + t1 + '」')

    // 4. 最后一步必须写出答案
    const last = ex.lines[ex.lines.length - 1]
    const finalText = last.board + ' ' + last.icon
    const answer = q.numeric ? q.ans.toString() : q.ansText
    if (q.numeric) {
      // 数字题：答案要作为独立数字出现（"3" 不能靠 "13" 蒙对）
      const digits = finalText.replace(/[^0-9]/g, ' ')
      check((' ' + digits + ' ').indexOf(' ' + answer + ' ') >= 0,
        tag + ' 最后一步没写出答案 ' + answer + '：' + finalText)
    } else {
      check(finalText.indexOf(answer) >= 0,
        tag + ' 最后一步没写出答案「' + answer + '」：' + finalText)
    }
  }
}

console.log('步数范围：' + minSteps + '~' + maxSteps + '　最长板书 ' + maxBoard + ' 字　最长口述 ' + maxSay + ' 字')
console.log('标题：' + Array.from(titleSeen).join(' / '))

// 每种题型都该有自己的讲解标题（同一个标题说明复制粘贴没改）
check(titleSeen.size >= 12, '讲解标题只有 ' + titleSeen.size + ' 种（应有 12 种以上，各题型要各讲各的）')

if (bad === 0) console.log('✅ 小黑板讲解：' + KINDS.length + ' 题型 × 200 道全部通过')
else console.log('❌ 小黑板讲解有 ' + bad + ' 项不合格')
process.exit(bad === 0 ? 0 : 1)
