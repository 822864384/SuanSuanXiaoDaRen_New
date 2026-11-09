/**
 * 逐条朗读队列（say-queue.uts）的行为测试
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 重点验的是"念不出来时不要演戏"：
 *  - Node 里没有 window / uni，系统 TTS 必然返回 false；
 *  - 这时队列必须**立刻收队**，只回调第 0 条就结束，绝不能把 3 个选项一路高亮过去。
 *    （真机上的等价场景：标准基座没有 UTS 插件、系统没装中文语音包）
 *  - 注意：样例**不能用「第一个，大」这类已进语音包的句子**（2026-11-09 起语文选项
 *    全量真人化），它们会命中真人通道返回 true——那是另一条用例（1b）的事。
 *
 * 另外验 stopSteps() 能彻底停下，以及空闲时 stepsRemainMs() 为 0。
 */
import { saySteps, stopSteps, stepsRunning, stepsRemainMs, keepWaitingVoice } from './engine-tmp/say-queue.mts'
import { VOICE_KEYS } from './engine-tmp/voice-index.mts'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.log('  ✗ ' + msg)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  /* 1. 读不出来 → 只点第 0 条就收队
   * 用确定不在语音包里的句子：真人包没命中、系统 TTS 也失败 → speak() 返回 false */
  let seen: number[] = []
  let finished = 0
  saySteps(
    ['语音包里肯定没有的句子甲', '语音包里肯定没有的句子乙', '语音包里肯定没有的句子丙'],
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

  /* 1b. 命中真人语音包的行 → speak() 返回 true，队列要能一路走完
   * 「第一个，大」自 2026-11-09 起在包里（语文选项真人化）。Node 里播放器建不出来，
   * 真人音频按"估时 + 留白"推进：3 行加起来约 5.5 秒，等它走完必须恰好一次"读完"。 */
  if (VOICE_KEYS.length > 0) {
    seen = []
    finished = 0
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
    await sleep(6200)
    check(JSON.stringify(seen) === '[0,1,2]', '真人命中的行应逐条高亮，实际：' + JSON.stringify(seen))
    check(finished === 1, '真人命中的行走完应恰好一次"读完"，实际：' + finished)
    check(!stepsRunning(), '走完后不应还在"在读"状态')
  }

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

  /* 4. 真人音频的"等它放完"判据
   *
   * Node 里没有播放器，isVoicePlaying() 恒为 false，这条链路只能在真机上跑到；
   * 所以把判断抽成 keepWaitingVoice()，在这里守住两个边界：
   *  - 还在放 → 必须等（语文识字就是栽在"按字数估完就跳下一格"，题目尾字被选项盖掉）
   *  - 放太久（播放器卡住）→ 必须收尾，不能把整队挂死
   */
  check(keepWaitingVoice(true, 1200), '真人音频还在放时必须继续等')
  check(!keepWaitingVoice(false, 1200), '真人音频放完了就该走下一格')
  check(!keepWaitingVoice(true, 15000), '超过上限必须收尾，否则整队会停在这一句')
  check(!keepWaitingVoice(true, 60000), '严重超时也必须收尾（播放器卡死兜底）')

  if (failures === 0) {
    console.log('\n✅ 逐条朗读队列：失败收队 / 可打断 / 空列表 / 等真人音频放完 全部通过')
  } else {
    console.log('\n❌ 逐条朗读队列失败 ' + failures + ' 处')
    process.exit(1)
  }
}

main()
