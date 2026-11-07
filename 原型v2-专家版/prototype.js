/* ===== 算算小达人 · 电视端原型 v2 交互逻辑 =====
 * 所有数据均为本地 mock，无网络请求、无持久化。
 * v2 相对 v1：修复交往模块情景切换崩溃；新增数字键直接作答；
 *   计时最后 5 秒变红+滴答音；答题按钮正确/错误即时着色；宠物投喂动画。
 */
'use strict';

/* ---------- 舞台缩放（1920×1080 等比适配任意窗口） ---------- */
const stage = document.getElementById('stage');
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080) * 0.97;
  stage.style.transform = `translate(-50%,-50%) scale(${s})`;
}
addEventListener('resize', fit); fit();

/* ---------- 简易音效（WebAudio 本地合成，无音频文件） ---------- */
let AC = null;
function beep(type) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    if (type === 'ok') {
      o.frequency.setValueAtTime(660, t);
      o.frequency.exponentialRampToValueAtTime(1320, t + .18);
      g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
      o.start(t); o.stop(t + .3);
    } else if (type === 'bad') {
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(140, t + .25);
      g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
      o.start(t); o.stop(t + .3);
    } else { /* tick */
      o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + .08);
      o.start(t); o.stop(t + .08);
    }
  } catch (e) { /* 音频不可用则静默 */ }
}

/* ---------- TTS 读题（面向不认识数字/文字的小朋友） ----------
 * 使用浏览器本地 SpeechSynthesis，无网络、无音频文件。
 * 出题自动朗读 + 🔊再听一遍 + 方向键聚焦选项时朗读选项 + 结果语音反馈。
 */
function stripEmoji(s) {
  return s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]/gu, '').trim();
}
function setSpeaking(on) {
  document.querySelectorAll('.mic-dot').forEach(d => d.classList.toggle('speaking', on));
}
function speak(text, lang) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(stripEmoji(text));
    u.lang = lang || 'zh-CN';
    u.rate = 0.85;          /* 放慢语速，适合幼儿 */
    u.pitch = 1.15;
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    synth.speak(u);
    return true;
  } catch (e) { return false; }
}
function stopSpeak() { try { window.speechSynthesis && window.speechSynthesis.cancel(); setSpeaking(false); } catch (e) {} }

/* ---------- 页面 & 焦点管理（遥控器模拟） ---------- */
let curPage = 'pg-profile', focusList = [], focusIdx = 0;
function showPage(id, firstSel) {
  stopResultVoice();
  stopSpeak();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  curPage = id;
  focusIdx = 0;
  refreshFocus();
  if (firstSel) {
    const i = focusList.findIndex(f => f.matches(firstSel));
    if (i >= 0) { focusIdx = i; updateFocus(); }
  }
}
function refreshFocus() {
  focusList = [...document.querySelectorAll('#' + curPage + ' .fx')];
  focusIdx = Math.min(focusIdx, Math.max(0, focusList.length - 1));
  updateFocus();
}
function updateFocus() {
  focusList.forEach((f, i) => f.classList.toggle('focused', i === focusIdx));
  /* 语音优先：键盘移动焦点到选项时，把选项读出来（不识字也能选） */
  if (navByKey) {
    const el = focusList[focusIdx];
    if (el && el.classList.contains('ans-btn') && !el.classList.contains('say')) {
      speak(el.textContent);
    }
    navByKey = false;
  }
}
function gateOpen() { return document.getElementById('gate-mask').classList.contains('show'); }

/* ---------- 全局键盘：方向键导航 + OK + 返回 + 数字直答 ----------
 * 小朋友不识字也能玩：方向键移到某个选项时，会把这个选项读出来。
 */
let navByKey = false;
addEventListener('keydown', e => {
  if (gateOpen()) {
    if (e.key === 'Enter') act('gate-ok');
    if (e.key === 'Escape') act('gate-cancel');
    return;
  }
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowDown') {
    navByKey = true;
    focusIdx = (focusIdx + 1) % focusList.length; updateFocus(); e.preventDefault();
  } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
    navByKey = true;
    focusIdx = (focusIdx - 1 + focusList.length) % focusList.length; updateFocus(); e.preventDefault();
  } else if (k === 'Enter') {
    navByKey = false;
    if (focusList[focusIdx]) focusList[focusIdx].click();
    e.preventDefault();
  } else if (k === 'Escape' || k === 'Backspace') {
    if (curPage !== 'pg-profile') act('go-home');
  } else if (curPage === 'pg-math' && /^[0-9]$/.test(k)) {
    answerMath(+k, null);   /* 数字键直接作答（0-9；10 请用按钮） */
  }
});

/* ---------- 特效 ---------- */
const EMOJIS = ['⭐', '✨', '🌟', '🎊', '💛', '🍬'];
function confetti(x, y, n = 36) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div'); s.className = 'confetti';
    s.textContent = EMOJIS[Math.random() * EMOJIS.length | 0];
    const a = Math.random() * Math.PI * 2, d = 180 + Math.random() * 260;
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 120}px`;
    stage.appendChild(s); setTimeout(() => s.remove(), 1500);
  }
}
let fbTimer = null;
function feedback(icon, text, sub, good, speakText) {
  const fb = document.getElementById('feedback');
  document.getElementById('fb-icon').textContent = icon;
  document.getElementById('fb-text').textContent = text;
  document.getElementById('fb-sub').textContent = sub;
  fb.style.background = good ? 'rgba(30,120,70,.45)' : 'rgba(120,60,30,.45)';
  fb.style.display = 'flex';
  const iconEl = fb.querySelector('.fb-icon');
  iconEl.classList.remove('pop'); void iconEl.offsetWidth; iconEl.classList.add('pop');
  confetti(960, 480, good ? 42 : 10);
  beep(good ? 'ok' : 'bad');
  clearTimeout(fbTimer);
  fbTimer = setTimeout(() => { fb.style.display = 'none'; }, good ? 1400 : 1600);
  /* 结果语音反馈：答错时把正确答案读出来 */
  if (speakText !== null) speak(speakText !== undefined ? speakText : `${text}，${sub}`);
}

/* ---------- 宠物 ---------- */
function feedPet() {
  document.getElementById('candy').textContent = +document.getElementById('candy').textContent + 1;
  const pet = document.getElementById('pet');
  pet.classList.remove('happy'); void pet.offsetWidth; pet.classList.add('happy');
}

/* ---------- 选项按钮构建（含正确/错误即时着色） ---------- */
function buildPad(el, items, cb) {
  el.innerHTML = '';
  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'ans-btn fx'; b.textContent = it.label; b.dataset.value = it.value;
    b.onclick = () => cb(it.value, b);
    el.appendChild(b);
  });
}
function markBtn(btn, ok) {
  if (!btn) return;
  btn.classList.add(ok ? 'correct' : 'wrong');
}

/* ---------- "🔊 再听一遍"通用按钮（读题重播） ---------- */
function addSayBtn(padId, getText) {
  const b = document.createElement('button');
  b.className = 'ans-btn say fx'; b.textContent = '🔊 再听一遍';
  b.onclick = () => { const t = getText(); if (t) speak(t); };
  document.getElementById(padId).appendChild(b);
  refreshFocus();
}

/* ================= 数学模块 ================= */
const PRAISE = ['太棒了！', '真厉害！', '口算小神童！', '完全正确！', '你真聪明！'];
const ENC = ['没关系，再来一次！', '差一点点哦！', '继续加油！'];
let mIdx = 0, mScore = 0, mRight = 0, mWrong = 0, mCombo = 0;
let mQuestion = null;          /* 当前题目 {q, ans}；null = 已作答，忽略输入 */
let mTimerId = null;
let mSpeakText = '';           /* 当前题目的朗读文本 */

/* ---------- 思维题库（4~5 岁认知水平，v2.2 新增） ----------
 * 六种题型：加法 / 减法 / 等分(平均分) / 数数 / 比多少 / 找规律
 * numeric=true → 数字答案(0~10 数字垫+语音)；否则 → 文字/emoji 选项
 */
const COUNT_THINGS = [['🍎', '苹果'], ['🍓', '草莓'], ['🍋', '柠檬'], ['⭐', '星星'],
  ['🐥', '小鸡'], ['🎈', '气球'], ['🚗', '小汽车']];
function pick(a) { return a[Math.random() * a.length | 0]; }
function genQuestion() {
  const kind = pick(['add', 'sub', 'share', 'count', 'more', 'pattern']);
  if (kind === 'add') {
    const a = 1 + Math.random() * 8 | 0, b = 1 + Math.random() * (9 - a) | 0;
    return { numeric: true, ans: a + b,
      display: `${a} + ${b} = <span class="blank">□</span>`,
      speak: `${a} 加 ${b}，等于几？`,
      hint: '🔊 听题，说出或按下答案' };
  }
  if (kind === 'sub') {
    const a = 2 + Math.random() * 8 | 0, b = 1 + Math.random() * (a - 1) | 0;
    return { numeric: true, ans: a - b,
      display: `${a} − ${b} = <span class="blank">□</span>`,
      speak: `${a} 减 ${b}，还剩几个？`,
      hint: '🔊 听题，说出或按下答案' };
  }
  if (kind === 'share') {   /* 等分：只分给 2 个小朋友，每人 2~4 颗 */
    const share = 2 + Math.random() * 3 | 0, total = share * 2;
    return { numeric: true, ans: share,
      display: `<div class="q-emojis">${'🍬'.repeat(total)}</div>` +
        `${total} 颗糖果平均分给 2 个小朋友 = <span class="blank">□</span> 颗`,
      speak: `这里有${total}颗糖果，要平均分给2个小朋友，每人分到几颗呀？记住哦，平均分就是每人一样多！`,
      hint: '🍬 平均分——每人要一样多哦' };
  }
  if (kind === 'count') {   /* 数数：3~7 个 */
    const n = 3 + Math.random() * 5 | 0;
    const [e, name] = pick(COUNT_THINGS);
    return { numeric: true, ans: n,
      display: `<div class="q-emojis">${e.repeat(n)}</div>一共有几个${name}？<span class="blank">□</span>`,
      speak: `数一数，一共有几个${name}呀？`,
      hint: '👆 一个一个点着数' };
  }
  if (kind === 'more') {    /* 比多少：左右两组 */
    const [e, name] = pick(COUNT_THINGS);
    let l = 1 + Math.random() * 4 | 0, r = 1 + Math.random() * 4 | 0;
    while (l === r) r = 1 + Math.random() * 4 | 0;
    return { numeric: false, ans: l > r ? '左边' : '右边',
      options: ['左边', '右边'],
      display: `<div class="q-groups">` +
        `<div class="q-group"><div class="q-emojis">${e.repeat(l)}</div><div class="q-side">左边</div></div>` +
        `<div class="q-group"><div class="q-emojis">${e.repeat(r)}</div><div class="q-side">右边</div></div></div>`,
      speak: `数一数，哪一边的${name}更多呀？`,
      hint: '⚖️ 哪边更多？' };
  }
  /* 找规律：ABAB 排列，下一个是什么 */
  const [e1] = pick(COUNT_THINGS); let e2 = pick(COUNT_THINGS)[0];
  while (e2 === e1) e2 = pick(COUNT_THINGS)[0];
  return { numeric: false, ans: e2, options: [e1, e2],
    display: `<div class="q-emojis">${e1}${e2}${e1}${e2}${e1}<span class="blank">？</span></div>接下来是哪一个？`,
    speak: `看一看，找一找规律，接下来应该出现哪一个呀？`,
    hint: '🔍 规律藏在前面的排列里' };
}

function updCombo() {
  const c = document.getElementById('m-combo');
  c.style.display = mCombo >= 2 ? 'block' : 'none';
  document.getElementById('m-combo-n').textContent = mCombo;
}

function startMathTimer(m) {
  const TOTAL = 25;   /* 思维题给足思考时间（4~5岁） */
  let t = TOTAL;
  const fill = document.getElementById('m-timer');
  fill.style.transition = 'none'; fill.classList.remove('urgent');
  fill.style.width = '100%'; void fill.offsetWidth;
  fill.style.transition = `width ${TOTAL}s linear`; fill.style.width = '0%';
  clearInterval(mTimerId);
  mTimerId = setInterval(() => {
    t--;
    if (t === 5) fill.classList.add('urgent');
    if (t <= 5 && t > 0) beep('tick');
    if (t <= 0) {
      clearInterval(mTimerId); mQuestion = null;
      mCombo = 0; updCombo(); mWrong++;
      feedback('⏰', '时间到啦', `正确答案是 ${m.ans}`, false, `时间到啦，正确答案是 ${m.ans}`);
      setTimeout(nextMath, 1600);
    }
  }, 1000);
}

function nextMath() {
  if (mIdx >= 5) { showResult('math'); return; }
  mQuestion = genQuestion(); mIdx++;
  document.getElementById('m-idx').textContent = mIdx;
  const qEl = document.getElementById('m-q');
  qEl.classList.remove('shake');
  qEl.innerHTML = mQuestion.display;
  document.getElementById('m-hint').textContent = mQuestion.hint;
  if (mQuestion.numeric) {
    const vals = [mQuestion.ans];
    while (vals.length < 6) { const v = Math.random() * 10 | 0; if (!vals.includes(v)) vals.push(v); }
    vals.sort((a, b) => a - b);
    buildPad(document.getElementById('m-pad'), vals.map(v => ({ label: v, value: v })), answerMath);
    const mic = document.createElement('button');
    mic.className = 'ans-btn say fx'; mic.textContent = '🎤 语音说答案';
    mic.onclick = () => voiceAnswer();
    document.getElementById('m-pad').appendChild(mic);
  } else {
    const opts = mQuestion.options.slice().sort(() => Math.random() - .5);
    buildPad(document.getElementById('m-pad'), opts.map(o => ({ label: o, value: o })), answerMath);
  }
  /* 自动读题：不认识数字的小朋友听题作答；选项靠方向键逐个听 */
  mSpeakText = mQuestion.speak;
  addSayBtn('m-pad', () => mSpeakText);
  setTimeout(() => speak(mSpeakText), 350);
  startMathTimer(mQuestion);
}

function answerMath(v, btn) {
  if (!mQuestion) return;          /* 已作答/超时，忽略 */
  const m = mQuestion; mQuestion = null;
  clearInterval(mTimerId); stopSpeak();
  const ok = v === m.ans;
  markBtn(btn, ok);
  if (ok) {
    mRight++; mScore++; mCombo++; updCombo();
    document.getElementById('m-score').textContent = mScore;
    feedback('🎉', PRAISE[Math.random() * PRAISE.length | 0], '+1 ⭐', true);
    feedPet();
    setTimeout(nextMath, 1900);
  } else {
    mWrong++; mCombo = 0; updCombo();
    feedback('🤔', ENC[Math.random() * ENC.length | 0], `正确答案是 ${m.ans}`, false,
      `没关系，正确答案是 ${m.ans}`);
    document.getElementById('m-q').classList.add('shake');
    setTimeout(nextMath, 2300);
  }
}

/* ---------- 浏览器语音识别（可选彩蛋：浏览器支持时真语音作答） ---------- */
function voiceAnswer() {
  if (!mQuestion) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { feedback('🎤', '这个浏览器不支持语音', '用数字按钮也一样哦', false); return; }
  const rec = new SR(); rec.lang = 'zh-CN'; rec.interimResults = false; rec.maxAlternatives = 5;
  feedback('🎙️', '请说话…', '说出 0~10 的答案', true);
  rec.onresult = e => {
    const txt = e.results[0][0].transcript;
    /* 数字白名单 + 同音映射（与设计文档判定策略一致） */
    const map = { '零': 0, '〇': 0, '一': 1, '幺': 1, '二': 2, '两': 2, '俩': 2, '三': 3, '仨': 3,
      '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9 };
    let got = null;
    for (const ch of txt) if (map[ch] !== undefined) got = map[ch];
    if (got === null) feedback('🎤', `听到了「${txt}」`, '再说一遍试试', false);
    else answerMath(got);
  };
  rec.onerror = () => feedback('🎤', '没听清', '靠近一点再说一次', false);
  try { rec.start(); } catch (e) { feedback('🎤', '麦克风启动失败', '检查权限后重试', false); }
}

/* ================= 语文模块 ================= */
const CN_WORDS = [
  { e: '🍎', w: '苹果', p: 'píng guǒ', ops: ['苹果', '香蕉', '西瓜'] },
  { e: '🐘', w: '大象', p: 'dà xiàng', ops: ['小猫', '大象', '老虎'] },
  { e: '☀️', w: '太阳', p: 'tài yáng', ops: ['月亮', '星星', '太阳'] },
  { e: '🐟', w: '小鱼', p: 'xiǎo yú', ops: ['小鱼', '小鸟', '小马'] },
  { e: '🌸', w: '花朵', p: 'huā duǒ', ops: ['花朵', '小草', '大树'] }];
let cIdx = 0, cScore = 0;
function nextCn() {
  if (cIdx >= 5) { showResult('cn'); return; }
  const w = CN_WORDS[cIdx]; cIdx++;
  document.getElementById('c-idx').textContent = cIdx;
  document.getElementById('c-emoji').textContent = w.e;
  const wordEl = document.getElementById('c-word');
  wordEl.textContent = '？'; wordEl.classList.remove('pop');
  document.getElementById('c-pinyin').textContent = w.p;
  buildPad(document.getElementById('c-pad'), w.ops.map(o => ({ label: o, value: o })), (v, btn) => {
    if (v === w.w) {
      cScore++;
      document.getElementById('c-score').textContent = cScore;
      wordEl.textContent = w.w; wordEl.classList.add('pop');
      markBtn(btn, true);
      feedback('✍️', '会写啦！笔顺跟上来', '+1 ⭐', true, `${w.w}，答对啦！跟老师再读一遍，${w.w}`);
      feedPet(); setTimeout(nextCn, 2200);
    } else {
      markBtn(btn, false);
      feedback('🌱', `这个是「${v}」哦`, `${w.w} 是哪一个？`, false, `这个是${v}哦，再想想，${w.w}是哪一个？`);
      setTimeout(nextCn, 2100);
    }
  });
  /* 读题：先听发音，再选（不识字也能玩） */
  addSayBtn('c-pad', () => `看图听一听，它叫什么名字？提示：${w.w}`);
  setTimeout(() => speak(`看图听一听，它叫什么名字？`), 350);
  refreshFocus();
}

/* ================= 英语模块 ================= */
const EN_WORDS = [
  { e: '🐱', en: 'cat', zh: '猫', ops: ['cat', 'dog', 'pig'] },
  { e: '🐶', en: 'dog', zh: '狗', ops: ['cat', 'dog', 'duck'] },
  { e: '🍎', en: 'apple', zh: '苹果', ops: ['egg', 'apple', 'banana'] },
  { e: '🐟', en: 'fish', zh: '鱼', ops: ['fish', 'bird', 'cow'] },
  { e: '🌙', en: 'moon', zh: '月亮', ops: ['sun', 'star', 'moon'] }];
let eIdx = 0, eScore = 0;
function nextEn() {
  if (eIdx >= 5) { showResult('en'); return; }
  const w = EN_WORDS[eIdx]; eIdx++;
  document.getElementById('e-idx').textContent = eIdx;
  document.getElementById('e-emoji').textContent = w.e;
  buildPad(document.getElementById('e-pad'), w.ops.map(o => ({ label: o, value: o })), (v, btn) => {
    if (v === w.en) {
      eScore++;
      document.getElementById('e-score').textContent = eScore;
      markBtn(btn, true);
      feedback('🙋', 'Great job!', `${w.en} · ${w.zh}  +1 ⭐`, true, `Great job! ${w.en}，${w.zh}`);
      feedPet(); setTimeout(nextEn, 1900);
    } else {
      markBtn(btn, false);
      feedback('😊', 'Try again!', `听：${w.en}～`, false, `再试试，听：${w.en}`);
      setTimeout(nextEn, 2100);
    }
  });
  /* 读题：中文提示 + 英文示范音（英语单词用英文语速慢读） */
  addSayBtn('e-pad', () => { speak(`用英语说说，它是什么？听好啦`); setTimeout(() => speak(w.en, 'en-US'), 1800); });
  setTimeout(() => { speak(`用英语说说，它是什么？听好啦`); setTimeout(() => speak(w.en, 'en-US'), 1800); }, 350);
  refreshFocus();
}

/* ================= 交往模块（v2 修复：动态渲染情景，无 DOM 索引越界） ================= */
const SO_SCENES = [
  { title: '《打招呼》', kid: '🦕', other: '👩‍🏫',
    kidSay: '（不敢说话…）', otherSay: '早上好呀，糖豆！',
    q: '糖豆应该说什么呀？', ops: ['老师好', '不理她', '快跑'], ok: '老师好',
    good: '糖豆大声说「老师好！」老师和糖豆都笑了 😄',
    bad: '糖豆低下头没说话——没关系，看，大胆说出来就好！' },
  { title: '《分享玩具》', kid: '🦕', other: '🐣',
    kidSay: '（抱住小汽车）', otherSay: '我可以玩小汽车吗？',
    q: '糖豆应该怎么做？', ops: ['抱住不给', '一起玩', '把它藏起来'], ok: '一起玩',
    good: '「我们一起玩吧！」两个好朋友玩得开心极了 🎈',
    bad: '糖豆抱住小汽车，小伙伴难过地走了…换一种方式试试？' }];
let soIdx = 0, soStar = 0;
function renderScene(s) {
  document.getElementById('so-scene').innerHTML =
    `<div class="actor walk">${s.kid}<div class="bubble">${s.kidSay}</div></div>` +
    `<div class="actor">${s.other}<div class="bubble">${s.otherSay}</div></div>`;
  document.getElementById('so-title').textContent = `🤝 情景剧场 · ${s.title}`;
  document.getElementById('so-q').textContent = s.q;
  soSpeakText = `${s.otherSay} ${s.q}`;
}
let soSpeakText = '';
function nextScene() {
  const s = SO_SCENES[soIdx % SO_SCENES.length];
  renderScene(s);
  const ops = s.ops.slice().sort(() => Math.random() - .5);
  buildPad(document.getElementById('so-pad'), ops.map(o => ({ label: o, value: o })), (v) => {
    if (v === s.ok) {
      soStar++;
      document.getElementById('s-star').textContent = soStar;
      feedback('🌟', '太棒啦！', s.good, true, `答对啦！${s.good}`);
      feedPet(); soIdx++; setTimeout(nextScene, 3200);
    } else {
      feedback('💡', '看看另一种结果…', s.bad, false, `${s.bad}`);
      setTimeout(() => {
        feedback('🌟', '跟糖豆一起说', `正确示范：${s.ok}`, true, `跟糖豆一起说：${s.ok}`);
        soIdx++; setTimeout(nextScene, 3000);
      }, 3000);
    }
  });
  /* 读题：情景对话 + 提问自动朗读，不识字也能跟剧情走 */
  addSayBtn('so-pad', () => soSpeakText);
  setTimeout(() => speak(soSpeakText), 600);
  refreshFocus();
}

/* ================= 结算 & 关卡 ================= */
let lastMode = 'math';
const MODE_NAME = { math: '🧮 数学思维', cn: '📖 语文识字', en: '🔤 英语单词', so: '🤝 交往剧场' };
const levels = { math: 1, cn: 1, en: 1, so: 1 };   /* 各科当前关卡（会话内累计） */

/* 结算页语音导航：持续听「下一关 / 再玩一次 / 回首页」 */
let resultRec = null, resultListening = false;
function startResultVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hint = document.getElementById('r-voice');
  hint.style.display = 'block';
  if (!SR) {
    hint.textContent = '（此浏览器不支持语音指令，点「🚀 下一关」按钮也可以）';
    return;
  }
  stopResultVoice();
  const rec = new SR();
  rec.lang = 'zh-CN'; rec.continuous = true; rec.interimResults = false;
  rec.onresult = e => {
    const t = e.results[e.results.length - 1][0].transcript;
    if (/下一关|下一局|继续/.test(t)) act('next-level');
    else if (/再玩|重来|再来|一次/.test(t)) act('replay');
    else if (/回首页|回家|退出/.test(t)) act('go-home');
  };
  rec.onerror = () => { /* 静默；重试由 onend 处理 */ };
  rec.onend = () => { if (resultListening && resultRec === rec) { try { rec.start(); } catch (e) {} } };
  resultRec = rec; resultListening = true;
  hint.textContent = '🎙️ 正在听：说「下一关」「再玩一次」或「回首页」';
  try { rec.start(); } catch (e) {}
}
function stopResultVoice() {
  resultListening = false;
  try { resultRec && resultRec.stop(); } catch (e) {}
  resultRec = null;
}

function showResult(mode) {
  lastMode = mode;
  let right, score;
  if (mode === 'math') { right = mRight; score = mScore; }
  else if (mode === 'cn') { right = cScore; score = cScore; }
  else if (mode === 'en') { right = eScore; score = eScore; }
  else { right = soStar; score = soStar; }
  const stars = right >= 5 ? 3 : right >= 3 ? 2 : right >= 1 ? 1 : 0;
  const praise = stars === 3 ? '你就是传说中的小神童！'
    : stars === 2 ? '进步飞快，继续保持！' : '今天也很棒，明天再来！';
  const lvl = levels[mode];
  document.getElementById('r-title').textContent =
    `🎉 ${MODE_NAME[mode]} · 第 ${lvl} 关 完成！`;
  document.getElementById('r-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('r-stat1').textContent = `答对 ${right} 题 · 答错 ${5 - right} 题`;
  document.getElementById('r-stat2').textContent = `获得 ⭐ ×${score} · 糖果 🍬 ×1`;
  document.getElementById('r-praise').textContent = praise;
  document.getElementById('total-stars').textContent =
    +document.getElementById('total-stars').textContent + score;
  document.getElementById('candy').textContent = +document.getElementById('candy').textContent + 1;
  confetti(960, 400, 80); beep('ok');
  showPage('pg-result', '.btn.gold');
  /* 语音播报结算并引导"下一关"，同时开启语音指令监听 */
  setTimeout(() => {
    speak(`第${lvl}关完成！获得${score}颗星。${praise}想继续的话，说"下一关"`);
    startResultVoice();
  }, 500);
}

/* ================= 动作路由 ================= */
function startMath() {
  mIdx = 0; mScore = 0; mRight = 0; mWrong = 0; mCombo = 0; updCombo();
  document.getElementById('m-score').textContent = 0;
  showPage('pg-math'); nextMath();
}
function act(a) {
  switch (a) {
    case 'enter-home': showPage('pg-home', '.c-math'); break;
    case 'go-math': startMath(); break;
    case 'go-cn':
      cIdx = 0; cScore = 0;
      document.getElementById('c-score').textContent = 0;
      showPage('pg-cn'); nextCn(); break;
    case 'go-en':
      eIdx = 0; eScore = 0;
      document.getElementById('e-score').textContent = 0;
      showPage('pg-en'); nextEn(); break;
    case 'go-so':
      soIdx = 0; soStar = 0;
      document.getElementById('s-star').textContent = 0;
      showPage('pg-so'); nextScene(); break;
    case 'go-home': clearInterval(mTimerId); showPage('pg-home', '.c-math'); break;
    case 'next-level': {
      /* 进入下一关：关卡数 +1，重新开始一轮 */
      const m = lastMode;
      levels[m]++;
      feedback('🚀', `第 ${levels[m]} 关出发！`, '加油，冲呀！', true, `第${levels[m]}关，出发！`);
      setTimeout(() => act('go-' + m), 1500);
      break;
    }
    case 'replay':
      act(lastMode === 'math' ? 'go-math' : lastMode === 'cn' ? 'go-cn'
        : lastMode === 'en' ? 'go-en' : 'go-so');
      break;
    case 'parent-gate':
      document.getElementById('gate-input').value = '';
      document.getElementById('gate-err').textContent = '';
      document.getElementById('gate-mask').classList.add('show');
      refreshFocus();
      setTimeout(() => document.getElementById('gate-input').focus(), 50);
      break;
    case 'gate-ok': {
      const v = +document.getElementById('gate-input').value;
      if (v === 19) {
        document.getElementById('gate-mask').classList.remove('show');
        showPage('pg-report', '.btn.ghost');
      } else {
        document.getElementById('gate-err').textContent = '不对哦，家长再算算～';
        document.getElementById('gate-input').value = '';
        document.getElementById('gate-input').focus();
      }
      break;
    }
    case 'gate-cancel':
      document.getElementById('gate-mask').classList.remove('show');
      refreshFocus();
      break;
    case 'feed': feedback('🍬', '糖豆吃到了！', '开心地转了个圈', true); break;
  }
}
/* data-act 统一事件委托（选项按钮自带 onclick） */
stage.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (t) act(t.dataset.act);
});

/* 启动 */
showPage('pg-profile', '.profile-card');
