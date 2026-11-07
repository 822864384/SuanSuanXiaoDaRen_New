/**
 * 真人语音「播放层」验证（需要假的 InnerAudioContext）
 *
 * 用法：node tests/run-engine-test.mjs
 *
 * 为什么单独一个文件：`voice.test.mts` 只验文本拆段与 key 契约（纯函数，不需要播放器）；
 * 这里的用例要模拟真机播放器的失败形态，必须先把 `globalThis.uni` 桩好再 import。
 *
 * 覆盖三条真机踩过的路径：
 *  1. 正常：整句按段顺序播完，不跳段
 *  2. 某一段 mp3 报错 → **不能静默吞掉**，剩下的文字要交给系统 TTS 补读
 *     （家长听到"只说了我们来看看这张图"就是这条断的）
 *  3. 播放器从头到尾不出声 → 同样要把整句文字交给 TTS，而不是一句都没有
 */
let played: Array<string> = []
let instances = 0

/** 播放器故障模式：bad=第二段报错；mute=永远不出声；ok=正常 */
let mode: string = 'ok'

class FakeCtx {
  src: string = ''
  volume: number = 1
  autoplay: boolean = false
  duration: number = 0
  _h: any = {}
  _timers: Array<number> = []
  _n: number = 0

  constructor() {
    instances++
  }

  onEnded(cb: any) {
    this._h.ended = cb
  }

  onPlay(cb: any) {
    this._h.play = cb
  }

  onError(cb: any) {
    this._h.error = cb
  }

  stop() {
    for (let i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i])
    this._timers = []
  }

  destroy() {
    this.stop()
  }

  play() {
    this._n++
    const self: FakeCtx = this
    if (mode == 'mute') return
    if (mode == 'bad' && this._n >= 1 && played.length >= 1) {
      // 第二段：换 src 之后播放器报错（真机上就是这么丢的）
      this._timers.push(setTimeout(() => {
        if (self._h.error != null) self._h.error({ errMsg: 'fake' })
      }, 5) as number)
      return
    }
    played.push(this.src.replace('/static/voice/', ''))
    this._timers.push(setTimeout(() => {
      if (self._h.play != null) self._h.play({})
    }, 5) as number)
    this._timers.push(setTimeout(() => {
      if (self._h.ended != null) self._h.ended({})
    }, 120) as number)
  }
}

// @ts-ignore  Node 里没有 uni：给播放层一个假实现
globalThis.uni = {
  createInnerAudioContext: (): FakeCtx => new FakeCtx()
}

const voice = await import('./engine-tmp/voice.mts')
const tts = await import('./engine-tmp/tts.mts')
const mind = await import('./engine-tmp/mind.mts')

let pass = 0
let fail = 0
function check(ok: boolean, msg: string) {
  if (ok) {
    pass++
  } else {
    fail++
    console.log('  ✗ ' + msg)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 等真人通道彻底停下（或用例超时） */
async function waitDone(limit: number): Promise<boolean> {
  const t0: number = Date.now()
  while (Date.now() - t0 < limit) {
    if (!voice.isVoicePlaying()) return true
    await sleep(30)
  }
  return false
}

const card = mind.mindLevelCards('P1', 1)[0]
const sentence: string = tts.mindSpeech('豆豆', card.scene, card.ask)

/** 每轮收集"交给 TTS 补读的文字" */
let missed: Array<string> = []
voice.setVoiceMissHandler((t: string) => {
  missed.push(t)
})

/* ---------------- 1. 正常：按顺序播完，不跳段 ---------------- */
mode = 'ok'
played = []
missed = []
instances = 0
check(voice.playVoiceText(sentence) === true, '正常机型应接手真人音频') // 整句或拆段命中都算
check(await waitDone(6000), '正常机型应在 6s 内播完')
check(played.length >= 2, '正常机型应播完至少 2 段（题目不能被截断），实际 ' + played.length.toString() + ' 段')
check(missed.length == 0, '正常播放不应触发 TTS 补读')
voice.stopVoice()

/* ---------------- 2. 第二段报错：剩下的文字必须补读 ---------------- */
mode = 'bad'
played = []
missed = []
instances = 0
voice.playVoiceText(sentence)
await waitDone(8000)
check(played.length >= 1, '第一段仍应正常播完，实际 ' + played.length.toString() + ' 段')
check(missed.length >= 1, '第二段报错后必须把剩下的文字交给 TTS（这就是"只念了开场白"的病根）')
let joined: string = ''
for (let i = 0; i < missed.length; i++) joined += missed[i]
check(joined.indexOf(card.ask) >= 0, 'TTS 补读的文字里应包含提问：' + joined)
voice.stopVoice()

/* ---------------- 3. 全程无声：整句文字都要补读 ---------------- */
mode = 'mute'
played = []
missed = []
instances = 0
voice.playVoiceText(sentence)
await waitDone(12000)
check(played.length == 0, '无声机型不应出现"假装在播"')
check(missed.length >= 1, '全程无声时也必须把整句交给 TTS，不能一句都没有')
joined = ''
for (let i = 0; i < missed.length; i++) joined += missed[i]
check(joined.indexOf(card.scene) >= 0, 'TTS 补读应包含情景：' + joined)
check(joined.indexOf(card.ask) >= 0, 'TTS 补读应包含提问：' + joined)
voice.stopVoice()

/* ---------------- 4. 停止后不再有残留播放 ---------------- */
mode = 'ok'
played = []
missed = []
voice.playVoiceText(sentence)
await sleep(120)
voice.stopVoice()
const n1: number = played.length
await sleep(400)
check(played.length == n1, 'stopVoice 之后不应再有新的段被播放')

console.log('✅ 语音播放层：' + pass.toString() + ' 条断言通过' + (fail > 0 ? '，' + fail.toString() + ' 条失败' : ''))
if (fail > 0) process.exit(0 + 1)
