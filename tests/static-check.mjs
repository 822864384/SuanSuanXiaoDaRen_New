/**
 * 静态检查（当前没有可用的 uni-app x 编译器时的替代校验）
 *
 * 覆盖四类真实踩过的坑：
 *  1. 结构：模板标签 / 花括号是否闭合
 *  2. 引用：import 的路径存在、导入的符号确实被 export
 *  3. 模板：{{ }}、指令里用到的变量是否在 script 中声明
 *  4. ucSS 限制：只允许 class 选择器、禁用伪元素 / gap / @keydown 等 uvue 不支持的能力
 *
 * 用法：node tests/static-check.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
/** pages.json / manifest.json 允许写注释（HBuilderX 也允许），解析前先剥掉块注释与行注释 */
const stripJsonComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')   // 行注释；前面是冒号时不动，避免误伤 https://
const pages = JSON.parse(stripJsonComments(fs.readFileSync(path.join(root, 'pages.json'), 'utf8')))
const uvues = pages.pages.map((p) => p.path + '.uvue')
uvues.push('App.uvue')

const KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'if', 'else', 'return', 'Math', 'Number', 'String', 'Array',
  'Object', 'JSON', 'uni', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'new', 'typeof', 'in', 'of', 'instanceof', 'void'
])

let problems = 0
function fail(file, msg) {
  problems++
  console.log('  ✗ [' + file + '] ' + msg)
}

for (const rel of uvues) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) {
    fail(rel, '文件不存在（pages.json 里注册了但没建）')
    continue
  }
  const src = fs.readFileSync(abs, 'utf8')
  const tpl = (src.match(/<template>([\s\S]*)<\/template>/) || [])[1] || ''
  const script = (src.match(/<script[^>]*>([\s\S]*?)<\/script>/) || [])[1] || ''
  const style = (src.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || ''

  /* 1. 结构 */
  const count = (s, re) => (s.match(re) || []).length
  if (count(tpl, /<view[\s>]/g) !== count(tpl, /<\/view>/g)) fail(rel, 'view 标签不闭合')
  if (count(tpl, /<text[\s>]/g) !== count(tpl, /<\/text>/g)) fail(rel, 'text 标签不闭合')
  if (count(src, /{/g) !== count(src, /}/g)) fail(rel, '花括号不配对')

  /* 2. import 校验 */
  for (const m of src.matchAll(/import\s*{([^}]+)}\s*from\s*'([^']+)'/g)) {
    const names = m[1].split(',').map((x) => x.trim()).filter(Boolean)
    const spec = m[2].replace('@/', '')
    const target = path.join(root, spec)
    if (!fs.existsSync(target)) {
      fail(rel, '导入文件不存在: ' + spec)
      continue
    }
    const body = fs.readFileSync(target, 'utf8')
    for (const n of names) {
      if (!new RegExp('export\\s+(const|function|class)\\s+' + n + '\\b').test(body)) {
        fail(rel, '目标文件未导出符号: ' + n + '（' + spec + '）')
      }
    }
  }

  /* 3. 模板变量 */
  const declared = new Set()
  for (const m of script.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1])
  for (const m of script.matchAll(/import\s*{([^}]+)}\s*from/g)) m[1].split(',').forEach((n) => declared.add(n.trim()))
  for (const m of script.matchAll(/\(([^)]*)\)\s*(?::\s*[\w<>|\[\]]+\s*)?=>/g)) {
    m[1].split(',').forEach((p) => {
      const t = p.trim().split(':')[0].trim()
      if (t) declared.add(t)
    })
  }
  for (const m of script.matchAll(/function\s+\w+\s*\(([^)]*)\)/g)) {
    m[1].split(',').forEach((p) => {
      const t = p.trim().split(':')[0].trim()
      if (t) declared.add(t)
    })
  }
  for (const m of tpl.matchAll(/v-for="\(?([^)"]*?)\)?\s+in\s+/g)) m[1].split(',').forEach((p) => declared.add(p.trim()))

  const exprs = []
  for (const m of tpl.matchAll(/\{\{([\s\S]*?)\}\}/g)) exprs.push(m[1])
  for (const m of tpl.matchAll(/(?:v-if|v-else-if|v-for|:class|:style|:key|@click)="([^"]*)"/g)) exprs.push(m[1])

  for (let e of exprs) {
    e = e.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``')
    e = e.replace(/\?\.\s*[A-Za-z_$][\w$]*/g, '').replace(/\.[A-Za-z_$][\w$]*/g, '')
    for (const m of e.matchAll(/([A-Za-z_$][\w$]*)/g)) {
      const id = m[1]
      if (!KEYWORDS.has(id) && !declared.has(id)) fail(rel, '模板引用了未声明变量: ' + id)
    }
  }

  /* 4. ucSS 限制 */
  const css = style.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const line of css.split('\n')) {
    const m = line.match(/^\s*([^@\s][^{]*?)\s*\{\s*$/)
    if (!m) continue
    const sel = m[1].trim()
    if (!sel.startsWith('.')) fail(rel, '非 class 选择器（ucss 不支持）: ' + sel)
    if (sel.indexOf('::') >= 0 || /:(before|after)/.test(sel)) fail(rel, '伪元素不受支持: ' + sel)
    if (sel.indexOf(',') >= 0 || sel.indexOf(' ') >= 0) fail(rel, '组合选择器不受支持: ' + sel)
  }
  if (/@keydown|@keyup/.test(tpl)) fail(rel, 'uvue 不支持 @keydown/@keyup，遥控器需原生插件')
  if (/\bgap\s*:/.test(css)) fail(rel, 'ucss 未支持 gap，请改用 margin')
  if (/\binset\s*:/.test(css)) fail(rel, 'ucss 未支持 inset')
  if (/position\s*:\s*fixed/.test(css)) fail(rel, '不建议使用 position: fixed（TV 端请用 absolute）')

  /* 5. App 平台渐变限制：只允许 linear-gradient(<to 方向>, 起色, 止色)，不支持角度/百分比色标/多色 */
  for (const m of css.matchAll(/linear-gradient\(([^)]*)\)/g)) {
    const args = m[1].split(',').map((s) => s.trim()).filter(Boolean)
    if (args.length !== 3) fail(rel, 'App 端 linear-gradient 只支持 3 个参数（方向, 起色, 止色），当前 ' + args.length + ' 个')
    if (/\ddeg\b/.test(args[0])) fail(rel, 'App 端 linear-gradient 不支持角度，请用 to top/right/bottom/left 组合')
    for (const a of args.slice(1)) {
      if (/%/.test(a)) fail(rel, 'App 端 linear-gradient 色标不支持百分比: ' + a)
    }
  }
}

/* manifest.json：permissions 每一项必须是完整 <uses-permission/> 片段（只写权限名 HBuilderX 会判「格式不正确」） */
const manifestRaw = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
const manifestText = stripJsonComments(manifestRaw)
let manifest = null
try {
  manifest = JSON.parse(manifestText)
} catch (e) {
  fail('manifest.json', 'JSON 解析失败（改配置后注意逗号/注释）: ' + e.message)
}
if (manifest) {
  const permLists = [
    ['app-android.distribute.permissions', manifest['app-android'] && manifest['app-android'].distribute && manifest['app-android'].distribute.permissions],
    ['app-android.distribute.excludePermissions', manifest['app-android'] && manifest['app-android'].distribute && manifest['app-android'].distribute.excludePermissions],
    ['app.distribute.android.permissions', manifest.app && manifest.app.distribute && manifest.app.distribute.android && manifest.app.distribute.android.permissions]
  ]
  for (const [name, list] of permLists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (typeof item !== 'string' || !/^<uses-permission\s+android:name="[^"]+"\s*\/>$/.test(item)) {
        fail('manifest.json', name + ' 格式不正确，应为 <uses-permission android:name="..."/>：' + String(item))
      }
    }
  }
}

/* 7. 儿童端文案红线（只扫儿童端，家长课堂不受此限）
 *
 * 为什么单独一条：儿童心理相关内容最容易出问题的不是代码，是措辞。
 *  - 不贴标签：不出现描述孩子的词（焦虑/内向/多动/胆小/磨蹭…）
 *  - 不宣称疗效：不出现医疗宣称（诊断/治疗/治愈/疗效）
 *  - 不惩罚：答错分支不出现"错"字（代码统一用 retry/best）
 * 先剥注释再扫，避免文档注释里的"不允许出现错字"被自己判违规。
 */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
const KID_FILES = [
  'common/mind.uts',
  // 题库（1000 个情景）：最容易混进"懒/怕/错"这类词的就是数据文件，必须一起扫
  'common/mind-bank.uts',
  'common/mind-video.uts',
  'pages/mind/mind.uvue',
  'pages/mind/play.uvue',
  'pages/mind/breath.uvue',
  'pages/mind/cinema.uvue',
  'pages/mind/watch.uvue',
  // 语文 / 英语：同样不许出现"错""失败"和标签词。
  // 这两科的文案规则更严：4 岁认不出字是正常状态，不是错误。
  'common/cn-words.uts',
  'common/cn-engine.uts',
  'common/en-words.uts',
  'common/en-engine.uts',
  'common/quiz.uts',
  'common/study-session.uts',
  'pages/study/study.uvue',
  // 交往剧场：社交场景同样不许评判孩子，也不是"答题"，没有"错"这一档
  'common/so.uts',
  'common/so-session.uts',
  'pages/so/so.uvue',
  'pages/so/play.uvue',
  // 数学：题面与小黑板讲解给孩子看，同样不许出现"错"（讲解只讲怎么做，不评价孩子）
  'common/math-engine.uts',
  'common/words.uts',
  'common/explain.uts',
  'pages/math/math.uvue',
  // 语音包的文本层：这里的模板串会被真的念给孩子听，同样受红线约束
  'common/voice-tpl.uts'
]
const KID_BANNED = ['焦虑', '内向', '多动', '胆小', '磨蹭', '拖拉', '懒', '诊断', '治疗', '治愈', '疗效', '失败']
for (const rel of KID_FILES) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) continue
  const body = stripComments(fs.readFileSync(abs, 'utf8'))
  for (const w of KID_BANNED) {
    if (body.indexOf(w) >= 0) {
      const i = body.indexOf(w)
      fail(rel, '儿童端出现标签/医疗词「' + w + '」: …' + body.slice(Math.max(0, i - 10), i + 6).replace(/\n/g, ' ') + '…')
    }
  }
  if (body.indexOf('错') >= 0) {
    const i = body.indexOf('错')
    fail(rel, '儿童端出现"错"字（改用"再看看/还可以"）: …' + body.slice(Math.max(0, i - 12), i + 8).replace(/\n/g, ' ') + '…')
  }
}

console.log(problems === 0 ? '✅ 静态检查通过：' + uvues.length + ' 个文件' : '❌ 共 ' + problems + ' 处问题')
process.exit(problems === 0 ? 0 : 1)
