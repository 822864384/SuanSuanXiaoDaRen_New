/**
 * 逐条朗读队列（say-queue.uts）的行为测试
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 重点验的是"念不出来时不要演戏"：
 *  - Node 里没有 window / uni，speak() 必然返回 false；
 *  - 这时队列必须**立刻收队**，只回调第 0 条就结束，绝不能把 3 个选项一路高亮过去。
 *    （真机上的等价场景：标准基座没有 UTS 插件、系统没装中文语音包）
 *
 * 另外验 stopSteps() 能彻底停下，以及空闲时 stepsRemainMs() 为 0。
 */
import { saySteps, stopSteps, stepsRunning, stepsRemainMs } from './engine-tmp/say-queue.mts'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.log('  ✗ ' + msg)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  /* 1. 读不出来 → 只点第 0 条就收队 */
  let seen: number[] = []
  let finished = 0
  saySteps(
    ['第一个，大', '第二个，小', '第三个，人'],
    'zh-CN',
    10,
    20,
    1.0,
    (i: number) => {
      seen.push(i)
    },
    () => {
      finished++
    }
  )
  check(stepsRunning(), '开始后应处于"在读"状态')
  await sleep(120)
  check(seen.length === 1 && seen[0] === 0, '念不出来时应只回调第 0 条，实际：' + JSON.stringify(seen))
  check(finished === 1, '"读完"回调应只触发一次，实际：' + finished)
  check(!stepsRunning(), '收队后不应还在"在读"状态')
  check(stepsRemainMs() === 0, '空闲时剩余时长应为 0')

  /* 2. stopSteps 能打断排程：之后不再有任何回调 */
  seen = []
  finished = 0
  saySteps(
    ['第一个，大', '第二个，小'],
    'zh-CN',
    10,
    20,
    1.0,
    (i: number) => {
      seen.push(i)
    },
    () => {
      finished++
    }
  )
  stopSteps()
  await sleep(120)
  check(seen.length === 0, 'stopSteps 之后不应再有高亮回调，实际：' + JSON.stringify(seen))
  check(finished === 0, 'stopSteps 之后不应再触发"读完"回调')

  /* 3. 空列表：不抛异常、不留状态 */
  saySteps([], 'zh-CN', 10, 20, 1.0, null, null)
  check(!stepsRunning(), '空列表不应进入"在读"状态')
  await sleep(30)

  if (failures === 0) {
    console.log('\n✅ 逐条朗读队列：失败收队 / 可打断 / 空列表 全部通过')
  } else {
    console.log('\n❌ 逐条朗读队列失败 ' + failures + ' 处')
    process.exit(1)
  }
}

main()
