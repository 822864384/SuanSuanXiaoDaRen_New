/**
 * 扩龄 + 防重复测试（2026-11-09）
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 覆盖：
 *  1. 引擎纯净性：math-engine.uts 不依赖存储层（引擎可独立被 Node / 错题库重建调用）
 *  2. store 的"做对记账"：记入、去重、按题型封顶、互不串题型
 *  3. 档位口径：tierOf 的年龄带映射
 */
import fs from 'node:fs'
import { tierOf, SECONDS_PER_QUESTION } from './engine-tmp/math-engine.mts'
import { STUDY_SECONDS } from './engine-tmp/quiz.mts'
import { QUESTION_OPTION_GAP_MS } from './engine-tmp/say-queue.mts'

let failures = 0
function check(cond, msg) {
  if (!cond) {
    failures++
    console.log('  ✗ ' + msg)
  }
}

/* ---------- 1. 引擎纯净性：引擎不该 import store ---------- */
const engineSrc = fs.readFileSync(new URL('./engine-tmp/math-engine.mts', import.meta.url), 'utf8')
check(!engineSrc.includes("from './store"), 'math-engine 不应依赖存储层（保持纯净，Node 测试和错题重建才能独立跑）')

/* ---------- 2. 做对记账（storage 用内存 Map 模拟） ---------- */
const mem = new Map()
;(globalThis as any).uni = {
  getStorageSync: (k: string) => (mem.has(k) ? mem.get(k) : ''),
  setStorageSync: (k: string, v: string) => { mem.set(k, String(v)) }
}
const store = await import('./engine-tmp/store.mts')

// 记入与读出（旧→新顺序）
store.addSeenSeed('math', 'count', 101)
store.addSeenSeed('math', 'count', 102)
store.addSeenSeed('math', 'add', 201)
check(JSON.stringify(store.getSeenSeeds('math', 'count')) === '[101,102]', '记账应按旧→新读出')
check(JSON.stringify(store.getSeenSeeds('math', 'add')) === '[201]', '不同题型互不串账')
check(store.getSeenSeeds('math', 'sub').length === 0, '没记过的题型应为空')
check(store.getSeenSeeds('cn', 'count').length === 0, '不同科目互不串账')

// 去重：同一种子记两次只算一次
store.addSeenSeed('math', 'count', 101)
check(JSON.stringify(store.getSeenSeeds('math', 'count')) === '[101,102]', '重复做对同一题不应重复记账')

// 封顶：同题型超过 60 条丢最旧的，其他题型不受影响
for (let i = 300; i < 400; i++) store.addSeenSeed('math', 'sub', i)
const subs = store.getSeenSeeds('math', 'sub')
check(subs.length === 60, '封顶后应剩 60 条：' + subs.length)
check(subs[0] === 340, '应丢掉最旧的（首条=340）：' + subs[0])
check(subs[subs.length - 1] === 399, '应保留最新的（末条=399）：' + subs[subs.length - 1])
check(store.getSeenSeeds('math', 'count').length === 2, '封顶不应影响其他题型')

// 种子前缀不串账：count:12 与 count:123 是两道不同的题
store.addSeenSeed('math', 'take', 12)
store.addSeenSeed('math', 'take', 123)
check(JSON.stringify(store.getSeenSeeds('math', 'take')) === '[12,123]', '种子前缀相似的记账不应互相吞掉')

// 脏数据兜底：混进坏条目不影响读出
mem.set('ssxdr.p2.seen.so', 'odd:77,bad-data,,odd:88')
check(JSON.stringify(store.getSeenSeeds('so', 'odd')) === '[77,88]', '脏条目应被跳过')

/* ---------- 3. 档位口径：4~8 岁四档 ---------- */
check(tierOf(1) === 1 && tierOf(3) === 1, '第 1~3 关应为档1（4~5 岁）')
check(tierOf(4) === 2 && tierOf(6) === 2, '第 4~6 关应为档2（5~6 岁）')
check(tierOf(7) === 3 && tierOf(9) === 3, '第 7~9 关应为档3（6~7 岁）')
check(tierOf(10) === 4 && tierOf(99) === 4, '第 10 关起应为档4（7~8 岁）')

/* ---------- 4. 单题计时 5 分钟 + 题干→选项 1 秒留白（用户 2026-11-09 指定） ---------- */
check(SECONDS_PER_QUESTION === 300, '数学单题超时应为 300 秒（5 分钟）：' + SECONDS_PER_QUESTION)
check(STUDY_SECONDS === 300, '语文英语单题超时应为 300 秒（5 分钟）：' + STUDY_SECONDS)
check(QUESTION_OPTION_GAP_MS === 1000, '题干念完到读选项之间应停 1 秒：' + QUESTION_OPTION_GAP_MS)

if (failures > 0) {
  console.log('math-grow.test.mts 失败 ' + failures + ' 项')
  process.exit(1)
}
console.log('math-grow.test.mts 全部通过（引擎纯净 / 记账去重封顶 / 档位口径）')
