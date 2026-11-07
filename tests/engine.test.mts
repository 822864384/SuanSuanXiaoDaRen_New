/**
 * 数学引擎抽样验证（v3 · Node 直接跑，不经 HBuilderX）
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 覆盖：
 *  1. 14 个题型全抽样，每题答案在 4~5 岁口径内
 *  2. 每题型专属边界（点数行数、三堆互异、守恒两边相等、模式 ABAB…）
 *  3. 数字垫 6 个、升序、含答案、值域 0~10
 *  4. 组卷 buildRound：5 题、同大类 ≤2、同题型不连续、至少 1 个送分题
 *  5. 判定（严格 / 宽匹配）、语音同音映射、星级
 */
import {
  genQuestion, genByKind, buildRound, tierOf, buildNumberOptions,
  isCorrectNumber, isCorrectText, shuffleOptions, parseNumberText,
  starsOf, resultPraise,
  KIND_COUNT, KIND_TAKE, KIND_CONSERVE, KIND_NEIGHBOR, KIND_SPLIT, KIND_ORDINAL,
  KIND_MORE3, KIND_LONGER, KIND_TALLER, KIND_WEIGHT, KIND_ODD, KIND_PATTERN,
  KIND_ADD, KIND_SUB,
  KIND_NEXTNUM, KIND_PATTERN2, KIND_HALF, KIND_ANALOGY, KIND_CAUSE, KIND_DAYTIME, KIND_NOTCAT
} from './engine-tmp/math-engine.mts'

let failures = 0
function check(cond, msg) {
  if (!cond) {
    failures++
    if (failures <= 40) console.log('  ✗ ' + msg)
  }
}

/** 数 emoji 个数：去掉变体选择符后按 code point 数，跳过空格 */
function countEmoji(s) {
  let n = 0
  for (const ch of s.replace(/\uFE0F/g, '')) {
    if (ch.trim() !== '') n++
  }
  return n
}

const ALL_KINDS = [
  KIND_COUNT, KIND_TAKE, KIND_CONSERVE, KIND_NEIGHBOR, KIND_SPLIT, KIND_ORDINAL,
  KIND_MORE3, KIND_LONGER, KIND_TALLER, KIND_WEIGHT, KIND_ODD, KIND_PATTERN,
  KIND_ADD, KIND_SUB,
  KIND_NEXTNUM, KIND_PATTERN2, KIND_HALF, KIND_ANALOGY, KIND_CAUSE, KIND_DAYTIME, KIND_NOTCAT
]

/* ---------- 1. 每个题型抽样 400 次 ---------- */
const N = 400
const stat = {}
for (const kind of ALL_KINDS) {
  stat[kind] = 0
  for (let i = 0; i < N; i++) {
    const q = genByKind(kind)
    stat[kind]++
    check(q.kind === kind, kind + ' 生成题型不符：' + q.kind)
    check(q.prompt.length > 0, kind + ' prompt 为空')
    check(q.hint.length > 0, kind + ' hint 为空')
    check(q.expr.length > 0, kind + ' expr 为空')
    check(q.layout.length > 0, kind + ' layout 为空')

    if (q.numeric) {
      check(q.ans >= 0 && q.ans <= 10, kind + ' 答案越界：' + q.ans)
      check(q.numberOptions.length === 6, kind + ' 数字垫不是 6 个')
      check(q.numberOptions.indexOf(q.ans) >= 0, kind + ' 数字垫不含答案')
      for (let k = 1; k < q.numberOptions.length; k++) {
        check(q.numberOptions[k - 1] < q.numberOptions[k], kind + ' 数字垫未升序')
      }
      check(isCorrectNumber(q, q.ans), kind + ' 自身答案判定失败')
    } else {
      check(q.options.length >= 2, kind + ' 选项不足：' + q.options.length)
      check(q.options.indexOf(q.ansText) >= 0, kind + ' 选项不含答案')
      check(isCorrectText(q, q.ansText), kind + ' 自身答案判定失败')
      // 选项两两不同（emoji 串或文字）
      for (let a = 0; a < q.options.length; a++) {
        for (let b = a + 1; b < q.options.length; b++) {
          check(q.options[a] !== q.options[b], kind + ' 选项重复：' + q.options[a])
        }
      }
    }

    /* 专属边界 */
    if (kind === KIND_COUNT) {
      check(q.ans >= 4 && q.ans <= 8, '点数越界：' + q.ans)
      check(countEmoji(q.emojis) + countEmoji(q.emojis2) === q.ans, '点数两行之和不等于答案')
      check(countEmoji(q.emojis) >= 1 && countEmoji(q.emojis2) >= 1, '点数有一行为空')
    } else if (kind === KIND_TAKE) {
      const nums = q.options.map((o) => countEmoji(o)).sort((a, b) => a - b)
      check(nums[1] - nums[0] === 2 && nums[2] - nums[1] === 2, '按数取物三堆应差 2：' + nums.join('/'))
      check(nums[1] === q.ans, '按数取物中间堆应为答案')
    } else if (kind === KIND_CONSERVE) {
      check(q.exempt === true, '守恒题必须免责')
      check(q.ansText === '一样多', '守恒题答案应为一样多')
      check(countEmoji(q.groups[0]) === countEmoji(q.groups[1]), '守恒题两边数量必须相同')
      check(q.groupClasses.length === 2 && q.groupClasses[0] !== q.groupClasses[1], '守恒题两组字号应不同（否则一眼看出一样多）')
    } else if (kind === KIND_NEIGHBOR) {
      check(q.ans >= 0 && q.ans <= 10, '相邻数越界：' + q.ans)
    } else if (kind === KIND_SPLIT) {
      const m = q.expr.match(/^(\d+)\s*可以分成\s*(\d+)/)
      check(m !== null, '分合题题干格式异常：' + q.expr)
      if (m) {
        check(parseInt(m[1]) === parseInt(m[2]) + q.ans, '分合题 总和 ≠ 部分和：' + q.expr + ' ans=' + q.ans)
      }
    } else if (kind === KIND_ORDINAL) {
      check(q.options.length === 5, '序数题应有 5 个选项')
      check(countEmoji(q.emojis) === 5, '序数题应有 5 个动物')
    } else if (kind === KIND_MORE3) {
      const nums = q.groups.map((g) => countEmoji(g))
      check(nums[0] !== nums[1] && nums[1] !== nums[2] && nums[0] !== nums[2], '三堆数量必须互不相同：' + nums.join('/'))
      const ansIdx = q.options.indexOf(q.ansText)
      check(ansIdx >= 0, '比多少答案不在选项内')
      const most = q.expr.indexOf('最多') >= 0
      for (let k = 0; k < 3; k++) {
        if (k === ansIdx) continue
        check(most ? nums[ansIdx] > nums[k] : nums[ansIdx] < nums[k], '比多少答案不是最多/最少')
      }
    } else if (kind === KIND_LONGER || kind === KIND_TALLER) {
      check(q.leftClass !== q.rightClass, '比长短/高矮两侧档位相同')
      check(q.options.length === 2, '比长短/高矮应为 2 选 1')
    } else if (kind === KIND_WEIGHT) {
      check(q.groups.length === 2, '比轻重应两组')
      check(q.ansText === q.groupLabels[0] || q.ansText === q.groupLabels[1], '比轻重答案应为其中一个物品')
    } else if (kind === KIND_ODD) {
      check(q.options.length === 4, '找不同应有 4 个选项')
      check(q.optionsLayout === 'grid2x2', '找不同应用 2×2 网格')
      check(q.hint.length > 0, '找不同提示为空')
    } else if (kind === KIND_PATTERN) {
      check(q.seq.length > 0, '找规律序列为空')
      check(countEmoji(q.seq) === 5, '找规律应为 5 项')
      const parts = [...q.seq.replace(/\uFE0F/g, '')]
      check(parts[0] === parts[2] && parts[2] === parts[4], '找规律奇数位应相同')
      check(parts[1] === parts[3], '找规律偶数位应相同')
      check(parts[0] !== parts[1], '找规律 A、B 应不同')
    } else if (kind === KIND_ADD) {
      check(q.ans >= 2 && q.ans <= 8, '加法越界：' + q.ans)
      check(q.groupSep === '+', '加法应有 + 分隔')
    } else if (kind === KIND_SUB) {
      check(q.ans >= 1 && q.ans <= 7, '减法越界：' + q.ans)
      check(countEmoji(q.emojis) <= 8, '减法被减数应 ≤8')
    }
  }
}

console.log('每题型抽样 ' + N + ' 次，共 ' + (N * ALL_KINDS.length) + ' 题')
console.log('题型分布：', stat)

/* ---------- 2. 组卷 ---------- */
const GROUP_OF = {
  [KIND_ADD]: 'op', [KIND_SUB]: 'op',
  [KIND_MORE3]: 'measure', [KIND_LONGER]: 'measure', [KIND_TALLER]: 'measure', [KIND_WEIGHT]: 'measure',
  [KIND_ODD]: 'class', [KIND_NOTCAT]: 'class',
  [KIND_PATTERN]: 'pattern', [KIND_PATTERN2]: 'pattern',
  [KIND_ANALOGY]: 'reason', [KIND_CAUSE]: 'reason', [KIND_DAYTIME]: 'reason'
}
function groupOf(kind) {
  return GROUP_OF[kind] || 'num'
}
const EASY = [KIND_COUNT, KIND_PATTERN, KIND_ODD]

for (let level = 1; level <= 15; level++) {
  for (let r = 0; r < 60; r++) {
    const round = buildRound(level)
    check(round.length === 5, '第 ' + level + ' 关组卷不是 5 题')
    const kinds = round.map((q) => q.kind)
    // 同大类 ≤2
    for (const g of ['num', 'measure', 'op', 'class', 'pattern']) {
      check(kinds.filter((k) => groupOf(k) === g).length <= 2, '第 ' + level + ' 关同大类超 2：' + kinds.join(','))
    }
    // 不连续重复
    for (let i = 1; i < kinds.length; i++) {
      check(kinds[i] !== kinds[i - 1], '第 ' + level + ' 关出现连续同题型：' + kinds.join(','))
    }
    // 至少 1 个送分题
    check(kinds.some((k) => EASY.indexOf(k) >= 0), '第 ' + level + ' 关没有送分题：' + kinds.join(','))
  }
}

/* L1 池不应出现序数 / 守恒等进阶题型 */
for (let r = 0; r < 80; r++) {
  const kinds = buildRound(1).map((q) => q.kind)
  check(kinds.indexOf(KIND_CONSERVE) < 0 && kinds.indexOf(KIND_ORDINAL) < 0, 'L1 池混入进阶题型：' + kinds.join(','))
}

/* ---------- 3. 判定与语音 ---------- */
const qNum = { numeric: true, ans: 8, ansText: '', exact: false }
check(isCorrectNumber(qNum, 8), '数字判定 8==8 失败')
check(!isCorrectNumber(qNum, 9), '数字判定 8!=9 失败')

const qText = { numeric: false, ans: '左边', ansText: '左边', exact: false }
check(isCorrectText(qText, '左边'), '文字判定失败')
check(isCorrectText(qText, '左边的'), '文字宽匹配失败')
check(!isCorrectText(qText, '右边'), '文字判定误判')

const qExact = { numeric: false, ans: '🍎🍎', ansText: '🍎🍎', exact: true }
check(isCorrectText(qExact, '🍎🍎'), '严格判定相等失败')
check(!isCorrectText(qExact, '🍎🍎🍎'), '严格判定不应宽匹配')

check(parseNumberText('八') === 8, '语音「八」应=8')
check(parseNumberText('我选两') === 2, '语音「两」应=2')
check(parseNumberText('是十') === 10, '语音「十」应=10')
check(parseNumberText('不知道') === -1, '无法识别应返回 -1')

/* ---------- 4. 数字垫兜底 ---------- */
for (let d = 0; d <= 10; d++) {
  const opts = buildNumberOptions(d)
  check(opts.length === 6, '数字垫兜底不是 6 个（答案 ' + d + '）')
  check(opts.indexOf(d) >= 0, '数字垫兜底不含答案（答案 ' + d + '）')
  check(opts[0] >= 0 && opts[5] <= 10, '数字垫兜底越界（答案 ' + d + '）')
}

/* ---------- 5. 星级与洗牌 ---------- */
check(starsOf(5) === 3 && starsOf(4) === 2 && starsOf(3) === 2 && starsOf(2) === 1 && starsOf(1) === 1 && starsOf(0) === 0, '星级边界错误')
check(resultPraise(3).length > 0, '表扬语为空')
for (let i = 0; i < 200; i++) {
  const q = genByKind(KIND_ODD)
  const s = shuffleOptions(q)
  check(s.length === q.options.length, '洗牌后长度变化')
  check(s.indexOf(q.ansText) >= 0, '洗牌后丢失正确答案')
}

/* ---------- 6. 档位映射 ---------- */
check(tierOf(1) === 1 && tierOf(3) === 1, 'tierOf 1~3 应为 L1')
check(tierOf(4) === 2 && tierOf(6) === 2, 'tierOf 4~6 应为 L2')
check(tierOf(7) === 3 && tierOf(9) === 3, 'tierOf 7~9 应为 L3')
check(tierOf(10) === 4 && tierOf(99) === 4, 'tierOf ≥10 应为 L4')

console.log(failures === 0 ? '\n✅ 全部通过，0 处失败' : '\n❌ 失败 ' + failures + ' 处')
if (failures > 0) process.exit(1)
