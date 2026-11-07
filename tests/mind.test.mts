/**
 * 心情小课堂（儿童心理健康教育）验证（Node 直接跑，不经 HBuilderX）
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 覆盖：
 *  1. 题库规模：50 个场景族 × 20 变体 = 1000 张卡
 *  2. 卡片完整性：id 唯一、主题合法、必填字段非空、选项不重复、答案在选项里
 *  3. 每条都必须有"怎么办"（solve）：这是模块的核心，不能只认情绪不给办法
 *  4. 情景不重复（1000 条要真是 1000 个情景，不是复制粘贴）
 *  5. 判定四型：P1 只认一个心情，P2~P6 都是"做法题"（选别的也照样给糖 + 给办法）
 *  6. 关卡：每关 5 张、关与关不重叠、覆盖全部卡片、边界夹取与循环
 *  7. 文案红线：不贴标签、不出现"错"字、不宣称疗效
 *  8. 读题文案：心情卡用"我们来看看这张图"；"可以这样做"必须紧跟解决办法
 *  9. emoji 基线：Android 7（Unicode 9）之后的 emoji 会显示方块，禁止出现在数据里
 */
import {
  MIND_CARDS, MIND_THEMES, MOODS, MIND_ROUND_SIZE, MIND_LEVEL_SIZE,
  cardsOf, themeOf, cardOf, progressOf, readyCardCount,
  mindLevelCount, mindLevelCards, clampMindLevel, nextMindLevel, mindLevelName,
  buildMindRound, judgeMind, mindSummary, moodLabelOf, moodEmojiOf, mindSolveTitle,
  JUDGE_ONE, JUDGE_ANY, JUDGE_BETTER,
  VERDICT_BEST, VERDICT_OK, VERDICT_RETRY, MindCard
} from './engine-tmp/mind.mts'
import { MIND_FAMS } from './engine-tmp/mind-bank.mts'
import { mindSpeech, mindRepeatSpeech, mindSolveSpeech } from './engine-tmp/tts.mts'

let bad = 0
function check(cond, msg) {
  if (!cond) {
    bad++
    console.log('  ✗ ' + msg)
  }
}

/* ---------------- 1. 题库规模 ---------------- */

check(MIND_FAMS.length === 50, '场景族应为 50 个，实际 ' + MIND_FAMS.length)
let itemSum = 0
for (const f of MIND_FAMS) {
  check(f.items.length === 20, '场景族 ' + f.key + ' 的变体应 20 个，实际 ' + f.items.length)
  itemSum += f.items.length
  const set = new Set(f.items)
  check(set.size === f.items.length, '场景族 ' + f.key + ' 有重复变体')
  check(f.opts.length === 3, '场景族 ' + f.key + ' 选项应 3 个')
  check(new Set(f.opts).size === 3, '场景族 ' + f.key + ' 选项有重复')
  check(f.opts.indexOf(f.answer) >= 0, '场景族 ' + f.key + ' 首选答案不在选项里')
}
check(itemSum === 1000, '变体总数应为 1000，实际 ' + itemSum)
check(MIND_CARDS.length === 1000, '卡片总数应为 1000，实际 ' + MIND_CARDS.length)

/* ---------------- 2. 卡片完整性 ---------------- */

const ids = new Set()
const scenes = new Set()
const themeIds = MIND_THEMES.map((t) => t.id)

for (const c of MIND_CARDS) {
  check(c.id.length > 0, '存在空 id 的卡')
  check(!ids.has(c.id), '卡片 id 重复: ' + c.id)
  ids.add(c.id)
  check(themeIds.indexOf(c.theme) >= 0, c.id + ' 的主题不存在: ' + c.theme)
  check(c.face.length > 0, c.id + ' 缺 face')
  check(c.mood.length > 0, c.id + ' 缺 mood')
  check(c.scene.length > 0, c.id + ' 缺 scene')
  check(c.ask.length > 0, c.id + ' 缺 ask')
  check(c.options.length === 3, c.id + ' 选项应为 3 个')
  check(c.judge === JUDGE_ONE || c.judge === JUDGE_ANY || c.judge === JUDGE_BETTER, c.id + ' judge 非法: ' + c.judge)
  check(c.comfort.length > 0, c.id + ' 缺 comfort（再看看时没有提示）')
  check(c.why.length > 0, c.id + ' 缺 why（答完没有解释）')

  const optSet = new Set(c.options)
  check(optSet.size === c.options.length, c.id + ' 选项有重复')

  if (c.judge === JUDGE_ONE) {
    check(c.answer.length > 0, c.id + ' judge=one 但没有答案')
    check(c.options.indexOf(c.answer) >= 0, c.id + ' 答案不在选项里')
  }
  if (c.judge === JUDGE_BETTER) {
    check(c.answer.length > 0, c.id + ' judge=better 但没有首选答案')
    check(c.options.indexOf(c.answer) >= 0, c.id + ' 首选答案不在选项里')
    for (const b of c.better) check(c.options.indexOf(b) >= 0, c.id + ' better 选项不在选项里: ' + b)
  }

  // 情景和提问都写"糖豆"，不写孩子本人：判断别人比判断自己安全
  check(c.scene.indexOf('糖豆') >= 0 || c.ask.indexOf('糖豆') >= 0, c.id + ' 情景里没有糖豆（避免让孩子自我暴露）')

  // 4. 情景不重复
  check(!scenes.has(c.scene), '情景重复: ' + c.scene)
  scenes.add(c.scene)
}

/* ---------------- 3. 每条都要有"怎么办" ---------------- */

for (const c of MIND_CARDS) {
  check(c.solve.length > 0, c.id + ' 缺 solve（只认情绪不给办法）')
  check(c.solve.length >= 8, c.id + ' solve 太短，说不清怎么做: ' + c.solve)
  check(c.solve.length <= 50, c.id + ' solve 太长，4~5 岁听不完: ' + c.solve.length + ' 字')
  check(c.solve !== c.why, c.id + ' solve 与 why 相同（应给做法而不是重复解释）')
  // 办法必须落在动作上，不能只是"要开心一点"这种劝
  check(/说|做|试|抱|数|走|呼|吸|放|找|问|收|停|告诉|喝|洗|分|换|看/.test(c.solve),
    c.id + ' solve 里没有可执行的动作: ' + c.solve)
}

/* ---------------- 5. 判定 ---------------- */

// P1 是"认心情"，只能有一个说得通
for (const c of cardsOf('P1')) {
  check(c.judge === JUDGE_ONE, c.id + '（认识情绪）judge 应为 one')
}
// P2~P6 是"选做法"，选别的也给糖（否则孩子会因为"另一个做法也能理解"被反复打断）
for (const t of MIND_THEMES) {
  if (t.id === 'P1') continue
  for (const c of cardsOf(t.id)) {
    check(c.judge === JUDGE_BETTER, c.id + ' 做法题 judge 应为 better')
  }
}

const one = cardOf('P1-1-01')
check(judgeMind(one, one.answer) === VERDICT_BEST, 'one: 正确答案应判 best')
check(judgeMind(one, one.options[0] === one.answer ? one.options[1] : one.options[0]) === VERDICT_RETRY,
  'one: 非答案应判 retry')

const anyCard = new MindCard()
anyCard.judge = JUDGE_ANY
anyCard.options = ['A', 'B', 'C']
for (const o of anyCard.options) check(judgeMind(anyCard, o) === VERDICT_BEST, 'any: 任何选项都应为 best')

const betterCard = new MindCard()
betterCard.judge = JUDGE_BETTER
betterCard.answer = '我很生气'
betterCard.better = ['我有点不高兴']
betterCard.options = ['我很生气', '我有点不高兴', '打他一下']
check(judgeMind(betterCard, '我很生气') === VERDICT_BEST, 'better: 首选应为 best')
check(judgeMind(betterCard, '我有点不高兴') === VERDICT_BEST, 'better: 次优也应算 best')
check(judgeMind(betterCard, '打他一下') === VERDICT_OK, 'better: 其它选项应为 ok（不能判死）')

// 做法题的每一个非首选选项都必须是 ok，不能出现 retry（retry 会打断孩子）
for (const c of cardsOf('P3')) {
  for (const o of c.options) {
    if (o === c.answer) continue
    check(judgeMind(c, o) === VERDICT_OK, c.id + ' 做法题选了另一个也应给 ok: ' + o)
  }
}

/* ---------------- 6. 关卡 ---------------- */

let totalLevels = 0
for (const t of MIND_THEMES) {
  const pool = cardsOf(t.id)
  check(pool.length % MIND_LEVEL_SIZE === 0, t.id + ' 卡片数不是每关 5 的整数倍（' + pool.length + '）')

  const lvCount = mindLevelCount(t.id)
  totalLevels += lvCount
  check(lvCount * MIND_LEVEL_SIZE === pool.length, t.id + ' 关数与卡片数对不上: ' + lvCount + ' 关')

  // 每关恰好 5 张，关与关不重叠，并集 = 全部卡片
  const famKeys = new Set(pool.map((c) => c.famKey))
  const famCount = famKeys.size
  const wantFams = Math.min(MIND_LEVEL_SIZE, famCount)
  const seen = new Set()
  for (let lv = 1; lv <= lvCount; lv++) {
    const cs = mindLevelCards(t.id, lv)
    check(cs.length === MIND_LEVEL_SIZE, t.id + ' 第 ' + lv + ' 关应为 5 张，实际 ' + cs.length)
    // 一关内必须跨场景族：否则五道题的提问、选项、图全一样，只剩物品不同
    const lvFams = new Set(cs.map((c) => c.famKey))
    check(lvFams.size === wantFams, t.id + ' 第 ' + lv + ' 关只有 ' + lvFams.size + ' 个场景族（应为 ' + wantFams + '）')
    for (const c of cs) {
      check(!seen.has(c.id), t.id + ' 第 ' + lv + ' 关出现重复卡: ' + c.id)
      seen.add(c.id)
      check(c.theme === t.id, t.id + ' 第 ' + lv + ' 关混进了别的主题: ' + c.id)
    }
    // 同一关两次取到的应完全一致（复习才有意义）
    const again = mindLevelCards(t.id, lv)
    check(again.map((c) => c.id).join(',') === cs.map((c) => c.id).join(','), t.id + ' 第 ' + lv + ' 关内容不稳定')
  }
  check(seen.size === pool.length, t.id + ' 关卡没有覆盖全部卡片')

  // 边界
  check(clampMindLevel(t.id, 0) === 1, t.id + ' 关号 <1 应夹到 1')
  check(clampMindLevel(t.id, 9999) === lvCount, t.id + ' 关号越界应夹到最后一关')
  check(nextMindLevel(t.id, 1) === 2, t.id + ' 第 1 关的下一关应为 2')
  check(nextMindLevel(t.id, lvCount) === 1, t.id + ' 最后一关的下一关应回到 1（可一直玩）')
  check(mindLevelName(3) === '第 3 关', 'mindLevelName 异常')
  check(mindLevelCards(t.id, 0).length === MIND_LEVEL_SIZE, t.id + ' 关号 0 应兜底成第 1 关')
}
check(totalLevels === 200, '总关数应为 200，实际 ' + totalLevels)

// 保留的随机组卷（混合复习用）
const r1 = buildMindRound('P1', [])
check(r1.length === MIND_ROUND_SIZE, '组卷数量应为 ' + MIND_ROUND_SIZE + '，实际 ' + r1.length)
check(new Set(r1.map((c) => c.id)).size === r1.length, '一轮内出现重复卡')
check(buildMindRound('NOT_EXIST', []).length === 0, '不存在的主题应返回空数组')
check(progressOf('P1', [MIND_CARDS[0].id]) === 1, '进度统计应为 1')

/* ---------------- 7. 文案红线 ---------------- */

const BANNED = ['焦虑', '内向', '多动', '胆小', '磨蹭', '拖拉', '懒', '诊断', '治疗', '治愈', '疗效', '失败']
const allText = []
for (const c of MIND_CARDS) {
  allText.push(c.scene, c.ask, c.comfort, c.why, c.solve, c.mood)
  for (const o of c.options) allText.push(o)
}
for (const t of MIND_THEMES) allText.push(t.title, t.sub)
for (const m of MOODS) allText.push(m.label)
allText.push(mindSolveTitle())

for (const s of allText) {
  for (const w of BANNED) check(s.indexOf(w) < 0, '文案出现标签/医疗词「' + w + '」: ' + s)
  check(s.indexOf('错') < 0, '儿童端文案出现"错"字: ' + s)
}

/* ---------------- 8. 结算与读题 ---------------- */

for (const t of MIND_THEMES) {
  const sum = mindSummary(t.id, 3, 5, 4)
  check(sum.length > 0, t.id + ' 结算总结为空')
  check(sum.indexOf('错') < 0, t.id + ' 结算总结出现"错"字')
  check(sum.indexOf('第 3 关') >= 0, t.id + ' 结算总结应带上关号')
}
check(mindSummary('P3', 2, 5, 3).indexOf('呼吸') >= 0, 'P3 总结应落到"呼吸"这个可执行动作上')

const sp = mindSpeech('豆豆', '小朋友把糖豆的小汽车抢走了', '糖豆心里是什么感觉？')
check(sp.indexOf('豆豆，我们来看看这张图。') === 0, '读题模板不对: ' + sp)
check(sp.indexOf('请听题') < 0, '心情模块不应使用"请听题"（考试语气）')
check(sp.indexOf('糖豆的小汽车抢走了。') > 0, '情景与提问之间应有句号停顿: ' + sp)

const spEmpty = mindSpeech('', '', '这是什么感觉？')
check(spEmpty.indexOf('小朋友，我们来看看这张图。') === 0, '空名字/空情景兜底失败: ' + spEmpty)

const rp = mindRepeatSpeech('糖豆很难过，一直哭', '可以找谁抱一抱？')
check(rp.indexOf('再看一遍。') === 0, '重听模板不对: ' + rp)
check(rp.indexOf('豆豆') < 0, '重听不应重复名字')

const sv = mindSolveSpeech('生气是很正常的感觉', '先深呼吸三次，再说我不喜欢这样')
check(sv.indexOf('生气是很正常的感觉。') === 0, '先说"这是正常的"，再给办法: ' + sv)
check(sv.indexOf('可以这样做。') > 0, '办法前应有"可以这样做"这句引导: ' + sv)
check(sv.indexOf('深呼吸') > 0, '办法内容丢了: ' + sv)
check(mindSolveSpeech('', '先喝口水') === '可以这样做。先喝口水', '空 why 时也应能读办法: ' + mindSolveSpeech('', '先喝口水'))

/* ---------------- 9. 主题表 ---------------- */

for (const t of MIND_THEMES) {
  check(t.title.length > 0 && t.sub.length > 0, t.id + ' 缺标题或副标题')
  check(t.ready, t.id + ' 应已开放（本次补齐 P2/P4/P5/P6）')
  check(cardsOf(t.id).length > 0, t.id + ' 已开放却没有卡片')
}
check(readyCardCount() === 1000, '已开放卡数应为 1000，实际 ' + readyCardCount())
check(MIND_THEMES.length === 6, '主题应为 6 个')
check(themeOf('P3').title === '让自己平静', 'themeOf 取错主题')
check(themeOf('NOT_EXIST').id === 'P1', 'themeOf 兜底应返回 P1')
check(MOODS.length === 5, '心情天气应为 5 档')
check(moodLabelOf('sun') === '很开心', 'moodLabelOf 异常')
check(moodEmojiOf('storm') === '⛈️', 'moodEmojiOf 异常')
check(moodLabelOf('NOT_EXIST') === '', 'moodLabelOf 兜底应为空串')

/* ---------------- 10. emoji 基线 ---------------- */

// Android 7 = Unicode 9。后面新增的 emoji 在电视盒子上会显示成方块。
// 这里只是黑名单兜底，新加数据时仍然要自己确认年份。
const RISKY = ['🧸', '🧺', '🧩', '🧍', '🧑', '🥬', '🥩', '🥺', '🥵', '🥲', '🦶', '🦷',
  '🪁', '🪆', '🪀', '🫧', '🩲', '🩹', '🤍', '🥸', '🫠']
for (const s of allText) {
  for (const e of RISKY) {
    check(s.indexOf(e) < 0, 'emoji「' + e + '」超出 Android 7 基线（Unicode 9），会显示方块: ' + s)
  }
}

console.log(bad === 0
  ? '✅ 心情小课堂：' + MIND_FAMS.length + ' 个场景族 / ' + MIND_CARDS.length + ' 个情景 / ' +
  totalLevels + ' 关（每关 5 题）全部通过'
  : '❌ 心情小课堂共 ' + bad + ' 处问题')
if (bad > 0) process.exit(1)
