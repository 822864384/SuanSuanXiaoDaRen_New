/**
 * 读题文案与音效素材校验（Node 直接跑）
 *
 * 用法：node tests/run-engine-test.mjs（与引擎测试一起跑）
 *
 * 覆盖：
 *  1. 读题模板：「{名字}，请听题。{题干}」，空名字/空题干要有兜底
 *  2. 重听模板不复述名字
 *  3. 朗读时长估算与字数正相关
 *  4. emoji / 符号清洗后仍能正常朗读
 *  5. static/sfx/*.wav 存在、RIFF 头合法、时长和体积在合理区间
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  questionSpeech, repeatSpeech, estimateSpeakMs, cleanForSpeech,
  optionSpeech, pickAskSpeech
} from './engine-tmp/tts.mts'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    if (failures <= 30) console.log('  ✗ ' + msg)
  }
}

console.log('— 读题文案 —')

check(
  questionSpeech('豆豆', '盘子里有3个苹果，又放进来2个，一共有几个？') ===
    '豆豆，请听题。盘子里有3个苹果，又放进来2个，一共有几个？',
  '标准模板不符合预期：' + questionSpeech('豆豆', '3加5等于几')
)

check(questionSpeech('', '3加5等于几') === '小朋友，请听题。3加5等于几', '空名字没有兜底称呼')
check(questionSpeech('  糖糖  ', '5可以分成2和几') === '糖糖，请听题。5可以分成2和几', '名字首尾空格未清理')
check(questionSpeech('豆豆', '   ') === '', '空题干应返回空串（不朗读）')

check(repeatSpeech('哪边更多') === '再听一遍。哪边更多', '重听模板不符合预期')
check(repeatSpeech('  ') === '再听一遍。', '空题干重听应有兜底')

console.log('— 朗读时长估算 —')

check(estimateSpeakMs('') === 0, '空文本应估 0ms')
const short = estimateSpeakMs('真棒')
const long = estimateSpeakMs('盘子里有3个苹果，又放进来2个，一共有几个')
check(short > 400 && short < 1400, '短句估算异常：' + short)
check(long > short * 3, '长句应显著长于短句：' + long + ' vs ' + short)
// 10 字 ≈ 10/4.0*1000+500 = 3000ms（语速 0.82 时实测约 4 字/秒），允许 ±20%
const ten = estimateSpeakMs('一二三四五六七八九十')
check(ten > 2400 && ten < 3700, '10 字估算超出合理区间：' + ten)

console.log('— 选项朗读（孩子不识字，靠"第几个"+高亮对号） —')

check(
  optionSpeech(0, '🍚 坐好，先把饭吃完') === '第一个，坐好，先把饭吃完',
  '选项朗读没去掉 emoji 或没带序号：' + optionSpeech(0, '🍚 坐好，先把饭吃完')
)
check(optionSpeech(1, '📺 一边看一边吃') === '第二个，一边看一边吃', '第二个序号不对')
check(optionSpeech(2, '🏃 边跑边吃') === '第三个，边跑边吃', '第三个序号不对')
// 纯图选项（数学/语文的图卡）没有可读文字：必须返回空串，页面据此不算进朗读队列
check(optionSpeech(0, '🍎🍎🍎') === '', '纯图选项应返回空串：' + optionSpeech(0, '🍎🍎🍎'))
check(optionSpeech(0, '   ') === '', '空选项应返回空串')
// 序号越界时不能崩，也不能丢内容
check(optionSpeech(9, '大') === '大', '超出序号表时应只读内容：' + optionSpeech(9, '大'))
check(pickAskSpeech().length > 0, '收尾问句不能为空')

// 解读要念得快一点：同样的字，1.1 倍速下估时应明显更短
const slowMs = estimateSpeakMs('一次做一件事，饭吃得快，也不容易噎着')
const fastMs = estimateSpeakMs('一次做一件事，饭吃得快，也不容易噎着', 1.1)
check(fastMs < slowMs, '1.1 倍速估时应短于默认：' + fastMs + ' vs ' + slowMs)
// 但也不能短到把长句掐掉：留 500ms 余量 + 字数换算仍要大于字数/6 秒
check(fastMs > slowMs * 0.7, '1.1 倍速不应缩短太多：' + fastMs + ' vs ' + slowMs)

console.log('— emoji 清洗 —')
// 中文问号必须保留：TTS 靠它读疑问语气，真人语音包的 key 也按带标点的原文算
check(cleanForSpeech('🍎3加5等于几？') === '3加5等于几？', '清洗结果异常：' + cleanForSpeech('🍎3加5等于几？'))
const full = cleanForSpeech(questionSpeech('豆豆', '🍎左边5个🍎右边5个，哪边更多？还是一样多？'))
check(full === '豆豆，请听题。左边5个右边5个，哪边更多？还是一样多？', '整句清洗结果异常：' + full)

console.log('— 音效素材 —')

const sfxDir = path.resolve(import.meta.dirname, '..', 'static', 'sfx')
const expected = [
  { file: 'ding.wav', min: 0.25, max: 0.9 },
  { file: 'correct.wav', min: 0.4, max: 1.2 },
  { file: 'wrong.wav', min: 0.4, max: 1.2 },
  { file: 'timeup.wav', min: 0.4, max: 1.2 },
  // 心情小课堂的"再看看"：比 wrong 更软，情绪模块里没有"错误"这一档
  { file: 'soft.wav', min: 0.4, max: 1.2 },
]

for (const e of expected) {
  const p = path.join(sfxDir, e.file)
  if (!fs.existsSync(p)) {
    check(false, '缺少音效文件 ' + e.file)
    continue
  }
  const buf = fs.readFileSync(p)
  check(buf.length > 44, e.file + ' 体积过小')
  check(buf.toString('ascii', 0, 4) === 'RIFF', e.file + ' 不是 RIFF')
  check(buf.toString('ascii', 8, 12) === 'WAVE', e.file + ' 不是 WAVE')
  const channels = buf.readUInt16LE(22)
  const sr = buf.readUInt32LE(24)
  const bits = buf.readUInt16LE(34)
  const dataBytes = buf.readUInt32LE(40)
  const dur = dataBytes / (sr * channels * (bits / 8))
  check(channels === 1, e.file + ' 应为单声道，实际 ' + channels)
  check(bits === 16, e.file + ' 应为 16bit，实际 ' + bits)
  check(sr >= 16000 && sr <= 48000, e.file + ' 采样率异常：' + sr)
  check(dur >= e.min && dur <= e.max, e.file + ' 时长 ' + dur.toFixed(2) + 's 超出 [' + e.min + ', ' + e.max + ']')
  check(buf.length < 64 * 1024, e.file + ' 体积过大：' + Math.round(buf.length / 1024) + 'KB')
}

const totalKb = expected.reduce((a, e) => {
  const p = path.join(sfxDir, e.file)
  return a + (fs.existsSync(p) ? fs.statSync(p).size : 0)
}, 0) / 1024
console.log('  音效总体积 ' + totalKb.toFixed(1) + ' KB')

if (failures === 0) {
  console.log('\n✅ 读题文案与音效素材全部通过')
} else {
  console.log('\n❌ 失败 ' + failures + ' 处')
  process.exit(1)
}
