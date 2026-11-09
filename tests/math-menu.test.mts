/**
 * 数学题型菜单测试（2026-11-09）
 *
 * 覆盖：
 *  1. 6 大类 / 29 题型与引擎的 KIND_* **逐个对照**（漏一个、多一个都红）
 *  2. 分类数据干净：无重复 kind、无重复名字、名字/图标/说明都不空
 *  3. kindName / kindEmoji / kindGroupName 回查正确
 *  4. math-session 单例：set → peek → take（取走即清空），空串表示综合闯关
 */
import {
  MATH_GROUPS, MATH_KIND_TOTAL, allMenuKinds, kindName, kindEmoji, kindGroupName,
  kindGroupId, findGroup, MathGroup, MathKind
} from './engine-tmp/math-menu.mts'
import {
  setMathKind, takeMathKind, peekMathKind,
  setMenuGroup, takeMenuGroup, peekMenuGroup
} from './engine-tmp/math-session.mts'
import {
  KIND_COUNT, KIND_TAKE, KIND_CONSERVE, KIND_NEIGHBOR, KIND_SPLIT, KIND_ORDINAL,
  KIND_MORE3, KIND_LONGER, KIND_TALLER, KIND_WEIGHT, KIND_ODD, KIND_PATTERN,
  KIND_ADD, KIND_SUB, KIND_NEXTNUM, KIND_PATTERN2, KIND_HALF, KIND_ANALOGY,
  KIND_CAUSE, KIND_DAYTIME, KIND_NOTCAT, KIND_COMPARE, KIND_SEQ, KIND_SHAPE,
  KIND_TENS, KIND_TWOSTEP, KIND_MULT, KIND_SHARE, KIND_CLOCK
} from './engine-tmp/math-engine.mts'

let pass = 0
let fail = 0

function check(cond: boolean, msg: string): void {
  if (cond) {
    pass++
  } else {
    fail++
    console.error('  ✗ ' + msg)
  }
}

/** 引擎侧的真实题型清单（新增题型时两边都必须改） */
const ENGINE_KINDS: Array<string> = [
  KIND_COUNT, KIND_TAKE, KIND_CONSERVE, KIND_NEIGHBOR, KIND_SPLIT, KIND_ORDINAL,
  KIND_MORE3, KIND_LONGER, KIND_TALLER, KIND_WEIGHT, KIND_ODD, KIND_PATTERN,
  KIND_ADD, KIND_SUB, KIND_NEXTNUM, KIND_PATTERN2, KIND_HALF, KIND_ANALOGY,
  KIND_CAUSE, KIND_DAYTIME, KIND_NOTCAT, KIND_COMPARE, KIND_SEQ, KIND_SHAPE,
  KIND_TENS, KIND_TWOSTEP, KIND_MULT, KIND_SHARE, KIND_CLOCK
]

const menuKinds: Array<string> = allMenuKinds()

/* ---------- 1. 与引擎逐个对照 ---------- */
check(ENGINE_KINDS.length === 29, '引擎题型应为 29 种，实际 ' + ENGINE_KINDS.length)
check(MATH_GROUPS.length === 6, '菜单应为 6 大类，实际 ' + MATH_GROUPS.length)
check(menuKinds.length === MATH_KIND_TOTAL, 'MATH_KIND_TOTAL 与实际条目不一致：' + MATH_KIND_TOTAL + ' vs ' + menuKinds.length)
check(menuKinds.length === 29, '菜单题型应为 29 种，实际 ' + menuKinds.length)

for (let i = 0; i < ENGINE_KINDS.length; i++) {
  const k = ENGINE_KINDS[i]
  check(menuKinds.indexOf(k) >= 0, '引擎题型没进菜单：' + k)
}
for (let i = 0; i < menuKinds.length; i++) {
  const k = menuKinds[i]
  check(ENGINE_KINDS.indexOf(k) >= 0, '菜单里的题型引擎里没有：' + k)
}

/* ---------- 2. 分类数据干净 ---------- */
const seen = new Set<string>()
for (let i = 0; i < menuKinds.length; i++) {
  check(!seen.has(menuKinds[i]), '题型重复出现：' + menuKinds[i])
  seen.add(menuKinds[i])
}

const seenName = new Set<string>()
const COLOR = /^#[0-9a-fA-F]{6}$/
for (let i = 0; i < MATH_GROUPS.length; i++) {
  const g: MathGroup = MATH_GROUPS[i]
  check(g.id.length > 0, '第 ' + (i + 1) + ' 个大类缺 id')
  check(g.name.length > 0, '第 ' + (i + 1) + ' 个大类缺名字')
  check(g.emoji.length > 0, '大类「' + g.name + '」缺图标')
  check(COLOR.test(g.color), '大类「' + g.name + '」主色不是 #rrggbb：' + g.color)
  check(g.kinds.length > 0, '大类「' + g.name + '」下面没有题型')
  // 6 大类分完 29 个题型：每类都要有，但不能某一类独吞
  check(g.kinds.length <= 10, '大类「' + g.name + '」题型过多（' + g.kinds.length + '），一屏放不下')
  for (let j = 0; j < g.kinds.length; j++) {
    const k: MathKind = g.kinds[j]
    check(k.name.length > 0, '题型 ' + k.kind + ' 缺名字')
    check(k.name !== k.kind, '题型 ' + k.kind + ' 名字还是英文标识（孩子看不懂）')
    check(k.emoji.length > 0, '题型 ' + k.kind + ' 缺图标')
    check(k.tip.length > 0, '题型 ' + k.kind + ' 缺一句话说明')
    check(!seenName.has(k.name), '题型名重复（孩子分不清）：' + k.name)
    seenName.add(k.name)
  }
}

/* ---------- 3. 回查函数 ---------- */
check(kindName('count') === '数一数', 'count 的名字应为「数一数」，实际 ' + kindName('count'))
check(kindEmoji('count').length > 0, 'count 应有图标')
check(kindGroupName('count') === '数与数数', 'count 应属于「数与数数」，实际 ' + kindGroupName('count'))
check(kindName('not-a-kind') === 'not-a-kind', '未知 kind 应原样返回（不返回空串）')
check(kindEmoji('not-a-kind') === '🧩', '未知 kind 应给兜底图标')
check(kindGroupName('not-a-kind') === '', '未知 kind 不应归到任何大类')
// 乘法属于运算类（扩龄题型里最容易归错的一类）
check(kindGroupName('mult') === '加减运算', 'mult 应属于「加减运算」，实际 ' + kindGroupName('mult'))
check(kindGroupName('clock') === '想一想', 'clock 应属于「想一想」，实际 ' + kindGroupName('clock'))

/* ---------- 4. 题型中转单例 ---------- */
check(peekMathKind() === '', '初始不应有待练题型')
check(takeMathKind() === '', '初始 take 应为空串（= 综合闯关）')
setMathKind('count')
check(peekMathKind() === 'count', 'set 之后 peek 应能看到 count')
check(takeMathKind() === 'count', '应取回 count')
check(peekMathKind() === '', '取走应立即清空（防下次误进专项）')
check(takeMathKind() === '', '第二次 take 应为空串')
// 结算页「换一个题型」会显式写空串：必须能覆盖掉上一次的 kind
setMathKind('add')
setMathKind('')
check(takeMathKind() === '', '后一次写空串应覆盖前一次（明确要求综合闯关）')

/* ---------- 5. kind → 大类 id（「换题型」回二级页的依据） ---------- */
check(kindGroupId('count') === 'num', 'count 应回「数与数数」(num)，实际 ' + kindGroupId('count'))
check(kindGroupId('conserve') === 'num', 'conserve 应回 num，实际 ' + kindGroupId('conserve'))
check(kindGroupId('mult') === 'op', 'mult 应回 op，实际 ' + kindGroupId('mult'))
check(kindGroupId('clock') === 'reason', 'clock 应回 reason，实际 ' + kindGroupId('clock'))
check(kindGroupId('not-a-kind') === '', '未知 kind 不应回任何大类（掉回六大类首页）')
// 每个题型都必须能回自己那一类，漏一个「换题型」就会掉回六大类
for (let i = 0; i < MATH_GROUPS.length; i++) {
  const g: MathGroup = MATH_GROUPS[i]
  for (let j = 0; j < g.kinds.length; j++) {
    check(kindGroupId(g.kinds[j].kind) === g.id, '题型 ' + g.kinds[j].kind + ' 的 kindGroupId 不等于 ' + g.id)
  }
}

/* ---------- 6. 大类回查（菜单页 onLoad 用它开二级视图） ---------- */
for (let i = 0; i < MATH_GROUPS.length; i++) {
  const g: MathGroup = MATH_GROUPS[i]
  const got: MathGroup | null = findGroup(g.id)
  check(got != null && got.name === g.name, 'findGroup(' + g.id + ') 应找回「' + g.name + '」')
  check(got != null && got.kinds.length === g.kinds.length, 'findGroup(' + g.id + ') 题型数应一致')
}
check(findGroup('nope') == null, '未知大类 id 应返回 null（整页停在六大类，不显示空页）')

/* ---------- 7. 「回到哪个大类」中转单例 ---------- */
check(peekMenuGroup() === '', '初始不应有待展开的大类')
check(takeMenuGroup() === '', '初始 take 应为空串（= 六大类首页）')
setMenuGroup('num')
check(peekMenuGroup() === 'num', 'set 之后 peek 应看到 num')
check(takeMenuGroup() === 'num', '应取回 num')
check(peekMenuGroup() === '', '取走应立即清空（防下次进菜单莫名跳过六大类）')
check(takeMenuGroup() === '', '第二次 take 应为空串')
// 首页入口会显式写空串：必须能盖掉上一次残留
setMenuGroup('op')
setMenuGroup('')
check(takeMenuGroup() === '', '后一次写空串应覆盖前一次')

console.log('数学题型菜单测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail > 0) process.exit(1)
