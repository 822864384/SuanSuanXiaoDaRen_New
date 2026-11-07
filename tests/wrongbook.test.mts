/**
 * 错题库验证（Node 直接跑，不经 HBuilderX）
 *
 * 覆盖：
 *  1. 进出库：答错进库、同题再错加次数、做对出库、按题面清库、三科互不干扰
 *  2. 存储：分隔符序列化能原样读回、脏数据不抛异常、超量按上限裁剪
 *  3. 重建（最关键）：靠 seed 把同一道题原样拿回来——题面、选项、答案、种子全一致
 *  4. 重练组卷：空库给空数组；有库按序取，跳过重建失败的老条目
 */
const mem = new Map()
globalThis.uni = {
  getStorageSync: (k) => (mem.has(k) ? mem.get(k) : null),
  setStorageSync: (k, v) => { mem.set(k, v) },
  removeStorageSync: (k) => { mem.delete(k) }
}

const {
  addWrong, removeWrong, clearOnCorrect, getWrongItems, wrongCount, wrongTotal,
  clearWrong, clearAllWrong, buildMathDrill, buildStudyDrill, drillReady, MAX_KEEP,
  WrongItem
} = await import('./engine-tmp/wrongbook.mts')
const me = await import('./engine-tmp/math-engine.mts')
const cn = await import('./engine-tmp/cn-engine.mts')
const en = await import('./engine-tmp/en-engine.mts')

let bad = 0
function check(cond, msg) {
  if (!cond) {
    bad++
    if (bad <= 40) console.log('  ✗ ' + msg)
  }
}

function itemOf(mode, q, answer, prompt) {
  const it = new WrongItem()
  it.mode = mode
  it.kind = q.kind
  it.seed = q.seed
  it.src = q.src ? q.src : ''
  it.unit = q.unitNo ? q.unitNo : 0
  it.answer = answer
  it.prompt = prompt
  it.misses = 1
  return it
}

/* ---------- 1. 进出库 ---------- */
const mq = me.genByKind(me.KIND_COUNT)
const mAns = mq.numeric ? String(mq.ans) : mq.ansText
addWrong(itemOf('math', mq, mAns, mq.prompt))
check(wrongCount('math') === 1, '答错一题后数学库应为 1 道')
check(wrongCount('cn') === 0, '数学错题不应跑到语文库')

// 同一道题再错一次：只是次数 +1，不重复占位
addWrong(itemOf('math', mq, mAns, mq.prompt))
check(wrongCount('math') === 1, '同一道题重复进库不应变成 2 条')
check(getWrongItems('math')[0].misses === 2, '重复进库应累计次数为 2')

// 做对 → 出库
check(removeWrong('math', mq.kind, mq.seed, '', mAns), 'removeWrong 应返回 true')
check(wrongCount('math') === 0, '做对后数学库应为空')

/* ---------- 2. 正常练习里做对同题面也会清掉 ---------- */
addWrong(itemOf('math', mq, mAns, mq.prompt))
check(clearOnCorrect('math', mq.prompt, mAns), 'clearOnCorrect 应清掉同题面的条目')
check(wrongCount('math') === 0, '清掉后数学库应为空')
check(!clearOnCorrect('math', '不存在的题面', 'x'), '没有匹配项时应返回 false')

/* ---------- 3. 三科隔离 + 合计 ---------- */
const cq = cn.buildCnRound(1)[0]
addWrong(itemOf('cn', cq, cq.answer, cq.prompt))
const eq = en.buildEnRound(1)[0]
addWrong(itemOf('en', eq, eq.answer, eq.prompt))
check(wrongCount('cn') === 1, '语文库应为 1 道')
check(wrongCount('en') === 1, '英语库应为 1 道')
check(wrongTotal() === 2, '合计应为 2 道')
check(getWrongItems('cn')[0].src.length > 0, '语文条目必须带题源字')
check(getWrongItems('en')[0].unit > 0, '英语条目必须带单元号')

/* ---------- 4. 重建：数学 ---------- */
const mq2 = me.genByKind(me.KIND_MORE3)
const mAns2 = mq2.numeric ? String(mq2.ans) : mq2.ansText
addWrong(itemOf('math', mq2, mAns2, mq2.prompt))
const drill = buildMathDrill(5)
check(drill.length >= 1, '重练组卷应至少给出一道数学题')
const back = drill[0]
check(back.kind === mq2.kind, '重建后题型应一致：' + back.kind + ' vs ' + mq2.kind)
check(back.expr === mq2.expr, '重建后题面应一致：' + back.expr + ' vs ' + mq2.expr)
check(back.prompt === mq2.prompt, '重建后读题文本应一致')
check(back.seed === mq2.seed, '重建后种子应一致')
const backAns = back.numeric ? String(back.ans) : back.ansText
check(backAns === mAns2, '重建后答案应一致：' + backAns + ' vs ' + mAns2)
check(back.options.join('|') === mq2.options.join('|'), '重建后选项应完全一致')
check(back.explain.lines.length === mq2.explain.lines.length, '重建后讲解步数应一致')

/* ---------- 5. 重建：语文 / 英语 ---------- */
const cnDrill = buildStudyDrill('cn', 5)
check(cnDrill.length === 1, '语文重练应给出一道题')
const cnBack = cnDrill[0]
check(cnBack.kind === cq.kind && cnBack.answer === cq.answer, '语文重建后题型与答案应一致')
check(cnBack.prompt === cq.prompt, '语文重建后读题文本应一致')
check(cnBack.options.join('|') === cq.options.join('|'), '语文重建后选项应完全一致')

const enDrill = buildStudyDrill('en', 5)
check(enDrill.length === 1, '英语重练应给出一道题')
const enBack = enDrill[0]
check(enBack.kind === eq.kind && enBack.answer === eq.answer, '英语重建后题型与答案应一致')
check(enBack.options.join('|') === eq.options.join('|'), '英语重建后选项应完全一致')

/* ---------- 6. 重建失败的老条目要跳过（题库改过 / 种子失效） ---------- */
const ghost = itemOf('math', mq2, '999', '这道题已经不存在了')
ghost.seed = 1
addWrong(ghost)
const drill2 = buildMathDrill(10)
let hasGhost = false
for (let i = 0; i < drill2.length; i++) {
  if (drill2[i].prompt === '这道题已经不存在了') hasGhost = true
}
check(!hasGhost, '重建不出来的老条目不应出现在重练题里')

/* ---------- 7. 自评题不进库（语文故事 / 英语跟读） ---------- */
const story = cn.buildCnRound(5).filter((x) => x.kind === 'cn6')
if (story.length > 0) {
  check(story[0].optionType === 'self', '字卡故事应为自评题')
}

/* ---------- 8. 脏数据不抛异常 ---------- */
mem.set('ssxdr.p2.wq.math', 'garbage\u0002more\u0001junk')
let ok = true
try {
  const list = getWrongItems('math')
  ok = list.length === 0
} catch (e) {
  ok = false
}
check(ok, '脏数据应被忽略而不是抛异常')
mem.delete('ssxdr.p2.wq.math')

/* ---------- 9. 上限裁剪 ---------- */
clearWrong('math')
for (let i = 0; i < MAX_KEEP + 10; i++) {
  const q = me.genByKind(me.KIND_COUNT)
  const a = q.numeric ? String(q.ans) : q.ansText
  const it = itemOf('math', q, a, q.prompt)
  it.seed = q.seed
  addWrong(it)
}
check(wrongCount('math') <= MAX_KEEP, '超过上限应裁剪，实际 ' + wrongCount('math'))

/* ---------- 10. 清空 ---------- */
clearAllWrong()
check(wrongTotal() === 0, 'clearAllWrong 后应为 0')
check(buildMathDrill(5).length === 0, '空库重练应返回空数组')
check(!drillReady('math'), '空库 drillReady 应为 false')

console.log(bad === 0 ? '\n✅ 错题库全部通过（进出库 / 三科隔离 / 种子重建 / 脏数据 / 上限）' : '\n❌ 错题库失败 ' + bad + ' 处')
if (bad > 0) process.exit(1)
