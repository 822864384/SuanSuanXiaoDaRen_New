# 真人语音包 · 维护说明

孩子听到的声音来自**本地 mp3 音频包**，不是系统 TTS。系统 TTS 只做兜底。

## 三条命令

```bash
# 1. 改了题库 / 字表 / 剧本之后：重新枚举"该有哪些句子"
node --experimental-strip-types tools/voice-script.mjs

# 2. 合成（已存在的自动跳过，增量更新）
python tools/voice-gen.py

# 3. 只是手动往目录丢了一批 mp3：只刷新索引
node tools/voice-index.mjs
```

第 2 步会顺带重写 `common/voice-index.uts`，不用单独跑第 3 步。

依赖：`pip install edge-tts`，以及 ffmpeg（可选，用于压体积，见下）。

## 目录

| 路径 | 作用 |
|---|---|
| `tools/voice-script.json` | 枚举产物：要合成哪些句子、每句用哪种语气 |
| `static/voice/<key>.mp3` | 音频本体，文件名是文本的 hash |
| `common/voice-index.uts` | 索引（自动生成，**不要手改**） |
| `common/voice-tpl.uts` | 文本层：hash、数字转中文、题型模板、拆段规则 |
| `common/voice.uts` | 播放层：InnerAudioContext 顺序播放 |
| `tools/voice-gen.py` | 批量合成 |
| `tools/voice-script.mjs` | 从数据源枚举句子 |

## 为什么用 hash 当文件名

文案有一千多条且会随题库改动。人工维护「这句叫 a01.mp3、那句叫 a02.mp3」必然漂移——改了文案忘了改映射，就会播错句子。

让生成脚本和运行时用**同一个 hash 函数**（`voiceKey`），改文案就是换 key，不会张冠李戴。代价是文件名不可读，排查时用 `tools/voice-script.json` 反查即可。

> ⚠️ `common/voice-tpl.uts` 的 `voiceKey`、`tools/voice-gen.py` 的 `voice_key` 必须逐位一致。
> `tests/voice.test.mts` 用三个硬编码值当"跨语言契约"，任何一边走偏立刻报错。
> Python 侧必须按 UTF-16 码元遍历（不是 `ord(ch)`），因为 JS 的 `charCodeAt` 取的是码元。

## 语气是怎么做出"感情"的

同一个温暖女声承担所有中文，**靠语速和音调区分心情，而不是换人**——换音色会让孩子觉得"老师换人了"，改韵律只会觉得"这句话更高兴"。

| role | 音色 | 语速 | 音调 | 用在哪 |
|---|---|---|---|---|
| `teach` | zh-CN-Xiaoxiao | -22% | +8Hz | 读题、讲解 |
| `story` | zh-CN-Xiaoxiao | -18% | +5Hz | 故事旁白 |
| `soothe` | zh-CN-Xiaoxiao | -30% | +0Hz | 安抚、给办法 |
| `cheer` | zh-CN-Xiaoxiao | -8% | +20Hz | 夸奖 |
| `num` | zh-CN-Xiaoxiao | -12% | +8Hz | 数字（要拼接，必须干净） |
| `en` | en-US-Ana | -15% | +0Hz | 英语（儿童音色，孩子更愿意跟读） |

改这张表在 `tools/voice-gen.py` 的 `VOICE_TABLE`。

## 覆盖范围

**整句录音**（最自然）：语文 30 课题干、英语 30 课题干、交往剧场全部旁白与选项、心情 1000 个情景正文与 50 条"怎么办"、所有夸奖鼓励语。

**拆段拼接**（覆盖随机组合）：数学题干。数学题是随机生成的，组合上万种，不可能穷举。做法是把题干按题型模板拆成「有 / 五 / 个 / 苹果 / ，拿走 / 二 / 个 / ，还剩几个呀？」这样的片段，每段都是独立音频，顺序播。

拼接的取舍：段之间会有几十毫秒间隙——对 4~5 岁**反而是好事**（一个词一个词说清楚）。但不要把两个语义单元塞进同一段，否则听起来是"卡住"而不是"放慢"。

**兜底**：任何没命中的句子走系统 TTS。**不会没有声音**，只是那一句音色不同。

> 判断某句走哪条路：`voiceSegments()` 返回空数组 = 走 TTS。
> 想让某句变真人音，就去 `tools/voice-script.mjs` 里加上它，重跑两条命令。

## 段间切换（真机最容易翻车的地方）

现象：**只念了「豆豆，请听题。」，后面的题干一声不响**。家长会以为题干没拼上，其实是播放器的锅。

Android 上复用同一个 `InnerAudioContext` 换 src 时，`stop()` → `src=` → `play()` 这三步挨着调用，播放器常常还停在复位过程中，`play()` 被静默丢弃（或 `setDataSource` 抛错走 `onError`）——于是第一段正常，第二段起全哑。

现在的做法（`common/voice.uts`）：

1. 换段先 `stop()`，留 90ms 再设 src、再 `play()`；
2. 之后每 150ms 查一次状态：没听到 `onPlay` 就重发 `play()`（最多 6 次）；
3. 还是不出声 → 自动切到「每段新建实例」模式（`useFresh`），把这一段重来；
4. 还不行 → **把「这一段 + 后面所有段」的文字交给系统 TTS 念完**（`setVoiceMissHandler`，见下）；
5. `onEnded` 只当加速信号，真正推进靠轮询（老电视盒子丢 `onEnded` 是常事），并用 `duration` 校准每段时长，避免留一大段空白。

## 断了就补读：题目绝不允许念一半

`onError`（mp3 坏、`setDataSource` 抛错）以前是"跳过这一段"，结果就是**家长听到「豆豆，我们来看看这张图。」然后安静了**，以为题干没拼上。

现在两层处理：

| 情形 | 处理 |
|---|---|
| 某段 `onError` | 先换新实例把这一段重来一次（`useFresh`） |
| 重来仍 `onError` / 一直没 `onPlay` | `failRest()`：停掉真人通道，把「当前段 + 之后所有段」的文字交给 `tts.uts` 的 `speakSystem()` 用系统 TTS 念完 |

代价是那半句会换音色（真人 → 机械），但**一句话里绝不会少字**。日志里会看到：

```
[voice] 片段播放失败：v2a28183f
[voice] 真人音频断了，剩下的交给系统 TTS：小朋友把糖豆的小汽车抢走了。糖豆心里是什么感觉？
```

`tests/voice-play.test.mts` 用假播放器覆盖了三条路径（正常 / 第二段报错 / 全程无声），改播放层前后都要跑它。

排查用的日志（`console` / logcat）：

```
[voice] 真人音频 4 段：豆豆，请听题。 | 数一数，一共有几个 | 苹果 | 呀？
[voice] 片段播放失败，跳过：v7110f560
[voice] 复用播放器放不出声音，改为每段新建实例
```

看到第三行说明这台设备的播放器复用有问题，功能会自动恢复，不需要改代码。

> 这套推进逻辑用「假播放器」在 Node 里跑过两种场景（正常 / 复用静默失败），
> 8 段题干都能按顺序播完；改动 `voice.uts` 后建议照这个办法回归一遍。

## 体积

默认为 edge-tts 原始输出（24kHz / 48kbps mono）。若包体吃紧，全量转 22.05kHz / 32kbps：

```bash
# 在 static/voice 下逐个转（并发 4，原地替换）
ls *.mp3 | xargs -P 4 -I{} ffmpeg -loglevel error -y -i {} -ac 1 -ar 22050 -b:a 32k {}_t.mp3 && \
  for f in *_t.mp3; do mv "$f" "${f%_t.mp3}.mp3"; done
```

语音内容用 16kHz 也够，但儿童音色的齿音会发闷，22.05kHz 是听感更好的下限。

## 版权口径

`edge-tts` 走的是微软 Edge「大声朗读」的公开接口，**仅供开发期生成素材、做原型验证**。

正式商用请改用已购买的 Azure 语音服务（同音色、有 SLA）或录音棚真人录制，并确认音色授权范围。这与影视片段「只外链不下载」是同一套口径：不占别人便宜。

素材本身是我们自己写的文案（字表、词表、剧本、题库全部自编），不涉及第三方课程内容。
