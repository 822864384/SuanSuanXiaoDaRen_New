/**
 * 枚举「应该有哪些真人音频」
 *
 * 从数据源（题库/字表/词表/剧本）把可朗读的句子全捞出来，去重后写成
 * `tools/voice-script.json`，交给 `tools/voice-gen.py` 批量合成。
 *
 * 用法：node --experimental-strip-types tools/voice-script.mjs
 *       node --experimental-strip-types tools/voice-script.mjs --stats   # 只看统计，不写文件
 *
 * role 决定合成时的韵律（见 voice-gen.py）：
 *   teach  读题/讲解   慢、平稳、清楚
 *   cheer  夸奖/鼓励   快一点、上扬
 *   soothe 安抚/平静   更慢、更低、柔和
 *   story  故事旁白    中等、有起伏
 *   num    数字        短促清楚（拼接时每段都要干净）
 *   en     英语        英文音色（儿童音）
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { syncCommon, cleanup, ROOT } from './sync-uts.mjs'

const wantStats = process.argv.includes('--stats')

const { dir, count } = syncCommon()
console.log(`已同步 ${count} 个 common 模块`)

const mod = async (name) => import(pathToFileURL(path.join(dir, name + '.mts')).href)

const vtp = await mod('voice-tpl')
const mindMod = await mod('mind')
const wordsMod = await mod('words')
const soMod = await mod('so')
const cnWordsMod = await mod('cn-words')
const enWordsMod = await mod('en-words')
const cnEngMod = await mod('cn-engine')
const enEngMod = await mod('en-engine')
const mathMod = await mod('math-engine')

/* ---------------- 收集器 ---------------- */

/** @type {Map<string, {text:string, role:string, lang:string, tag:string}>} */
const seen = new Map()

function add(text, role = 'teach', tag = '', lang = 'zh-CN') {
  if (typeof text !== 'string') return
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length === 0) return
  if (t.length > 120) return // 超长句不合成（没有这种朗读场景，且会拖慢生成）
  if (seen.has(t)) return
  seen.set(t, { text: t, role, lang, tag })
}

/* 1. 叫名字开场（豆豆，请听题。 / 糖糖，我们来看看这张图。 …） */
for (const h of vtp.nameHeadList()) add(h, 'teach', 'name-head')

/* 1b. 通用句首：「再听一遍。」这类会单独念，必须自己有音频 */
for (const p of vtp.genericPrefixes()) add(p, 'teach', 'generic-prefix')

/* 2. 数学：模板固定串 + 数字 + 名词 + 类别 */
for (const p of vtp.tplFixedParts()) add(p, 'teach', 'math-fixed')
for (let n = 0; n <= 20; n++) add(vtp.numToCnText(String(n)), 'num', 'number')
for (const th of wordsMod.THINGS) add(th.name, 'teach', 'thing')
// 分类题念的是类别名（catName 收的是英文键，传中文会一律返回"玩具"）
for (const c of ['fruit', 'animal', 'vehicle', 'toy']) add(wordsMod.catName(c), 'teach', 'cat')
// 比长短/比轻重题面里的选项词
for (const w of ['左边', '右边', '一样多', '最长', '最短']) add(w, 'teach', 'option')

/* 3. 夸奖与鼓励（情绪不同，单独 role） */
for (const p of mathMod.PRAISE) add(p, 'cheer', 'praise')
for (const e of mathMod.ENCOURAGE) add(e, 'soothe', 'encourage')

/* 4. 语文：30 课全量题干 */
for (let lv = 1; lv <= 30; lv++) {
  for (const q of cnEngMod.buildCnRound(lv)) add(q.prompt, 'teach', 'cn-q' + q.kind)
}

/* 5. 英语：30 课全量题干（英文词本身用英文音色） */
for (let lv = 1; lv <= 30; lv++) {
  for (const q of enEngMod.buildEnRound(lv)) {
    add(q.prompt, 'en', 'en-q' + q.kind, 'en-US')
    // 跟读题只给一个词，单独再收一次（可能和 prompt 相同，去重后无副作用）
    if (q.kind === 'en5') add(q.mainText, 'en', 'en-word', 'en-US')
  }
}

/* 6. 交往剧场：旁白 / 提问 / 选项 / 示范 / 跟读句 */
for (const ep of soMod.SO_EPISODES) {
  for (const b of ep.beats) add(b.text, 'story', 'so-beat')
  add(ep.ask, 'story', 'so-ask')
  for (const o of ep.options) add(o.label, 'story', 'so-opt')
  add(ep.demo, 'soothe', 'so-demo')
  add(ep.phrase, 'soothe', 'so-phrase')
  add(ep.phraseTip, 'teach', 'so-tip')
}

/* 7. 心情小课堂：1000 张卡的正文（scene + ask）与「怎么办」 */
for (const c of mindMod.MIND_CARDS) {
  // 朗读时是「{名字}，我们来看看这张图。」+ scene +「。」+ ask
  // 名字与开场已有独立音频，这里只合成正文部分
  add(c.scene + '。' + c.ask, 'story', 'mind-scene')
  // 反馈浮层：先解释后办法
  add(c.why + '。可以这样做。' + c.solve, 'soothe', 'mind-solve')
}

/* ---------------- 统计 ---------------- */

const byRole = {}
const byTag = {}
let chars = 0
for (const v of seen.values()) {
  byRole[v.role] = (byRole[v.role] || 0) + 1
  const t = v.tag.replace(/[0-9]+$/, '')
  byTag[t] = (byTag[t] || 0) + 1
  chars += v.text.length
}

console.log('\n=== 按 role ===')
for (const k of Object.keys(byRole).sort()) console.log('  ' + k.padEnd(8), byRole[k])
console.log('\n=== 按来源 ===')
for (const k of Object.keys(byTag).sort((a, b) => byTag[b] - byTag[a])) {
  console.log('  ' + k.padEnd(14), byTag[k])
}
console.log('\n总数 ' + seen.size + ' 条，共 ' + chars + ' 字')
console.log('预估音频体积：约 ' + Math.round((chars / 3) * 6) + ' KB（48kbps 估算）')

if (!wantStats) {
  const out = {
    generatedAt: new Date().toISOString(),
    count: seen.size,
    chars,
    items: Array.from(seen.values())
  }
  const p = path.join(ROOT, 'tools', 'voice-script.json')
  fs.writeFileSync(p, JSON.stringify(out, null, 1))
  console.log('\n已写入 ' + p)
}

cleanup(dir)
