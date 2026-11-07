#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
批量合成真人语音包

输入：tools/voice-script.json（由 tools/voice-script.mjs 枚举产出）
输出：static/voice/<key>.mp3 + 自动刷新 common/voice-index.uts

用法：
    python tools/voice-gen.py                # 全量（已存在的跳过）
    python tools/voice-gen.py --limit 20     # 先试 20 条
    python tools/voice-gen.py --force        # 全部重生成
    python tools/voice-gen.py --dry-run      # 只看要做什么

依赖：pip install edge-tts

音色策略（"真人 + 带感情"就落在这张表里）：
    同一个温暖女声承担所有中文，靠**语速/音调**区分说话的心情，而不是换人——
    换音色会让孩子觉得"老师换人了"，改韵律只会觉得"老师这句话更高兴/更温柔"。
    英语单独用儿童音色（en-US-AnaNeural），跟读时孩子更愿意开口。

⚠️ 版权与合规：edge-tts 走的是微软 Edge「大声朗读」的公开接口，仅供**开发期生成素材/原型验证**。
   正式商用请改用已购买的 Azure 语音服务（同音色、有 SLA）或真人录音棚录制，
   并确认音色授权范围。这一点和影视片段"只外链不下载"是同一套口径：不占别人便宜。
"""

import argparse
import asyncio
import json
import os
import re
import sys

try:
    import edge_tts
except ImportError:
    print("缺少依赖：pip install edge-tts")
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "tools", "voice-script.json")
OUT_DIR = os.path.join(ROOT, "static", "voice")
INDEX = os.path.join(ROOT, "common", "voice-index.uts")

# role -> (音色, 语速, 音调)
# 数值口径：-22% 大约 4 字/秒（4~5 岁跟得上，又不像系统 TTS 那样机械拖长）
VOICE_TABLE = {
    "teach":  ("zh-CN-XiaoxiaoNeural", "-22%", "+8Hz"),   # 读题、讲解：慢而清楚
    "story":  ("zh-CN-XiaoxiaoNeural", "-18%", "+5Hz"),   # 故事旁白：稍有起伏
    "soothe": ("zh-CN-XiaoxiaoNeural", "-30%", "+0Hz"),   # 安抚、办法：最慢最柔
    "cheer":  ("zh-CN-XiaoxiaoNeural", "-8%",  "+20Hz"),  # 夸奖：快、亮、上扬
    "num":    ("zh-CN-XiaoxiaoNeural", "-12%", "+8Hz"),   # 数字：短促干净（要拼接）
    "en":     ("en-US-AnaNeural",      "-15%", "+0Hz"),   # 英语：儿童音色
}
DEFAULT_ROLE = "teach"


def voice_key(text: str) -> str:
    """
    与 common/voice-tpl.uts 的 voiceKey 逐位一致

    JS 的 charCodeAt 取的是 UTF-16 码元，所以这里也必须按 UTF-16 编码逐 2 字节读，
    不能直接用 ord(ch)——emoji 之类补充平面字符会得到不同结果，音频就全失配了。
    """
    h = 5381
    b = text.encode("utf-16-le")
    for i in range(0, len(b), 2):
        cu = b[i] | (b[i + 1] << 8)
        h = (h * 131 + cu) % 2147483647
    return "v" + format(h, "08x")


EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF\U0000FE00-\U0000FE0F]"
)


def clean(text: str) -> str:
    """去掉 emoji 与多余空白（TTS 念 emoji 会读出奇怪的东西）"""
    t = EMOJI_RE.sub("", text)
    return re.sub(r"\s+", " ", t).strip()


async def synth_one(sem, item, force):
    text = clean(item["text"])
    if not text:
        return ("skip", item["text"][:12], "")
    key = voice_key(text)
    out = os.path.join(OUT_DIR, key + ".mp3")
    if os.path.exists(out) and not force and os.path.getsize(out) > 800:
        return ("cached", key, "")

    voice, rate, pitch = VOICE_TABLE.get(item.get("role", DEFAULT_ROLE), VOICE_TABLE[DEFAULT_ROLE])
    async with sem:
        for attempt in range(3):
            try:
                comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                await comm.save(out)
                if os.path.exists(out) and os.path.getsize(out) > 800:
                    return ("ok", key, "")
                raise RuntimeError("产物过小")
            except Exception as e:  # noqa: BLE001
                if attempt == 2:
                    return ("fail", key, f"{text[:16]} -> {e}")
                await asyncio.sleep(1.2 * (attempt + 1))
    return ("fail", key, text[:16])


def write_index(keys):
    """重写 common/voice-index.uts"""
    keys = sorted(set(keys))
    body = ",\n".join("  '%s'" % k for k in keys)
    src = f'''/**
 * 真人语音包索引（**自动生成，不要手改**）
 *
 * 由 `python tools/voice-gen.py`（或 `node tools/voice-index.mjs` 单独刷新）扫描
 * `static/voice/*.mp3` 后重写本文件。
 * 每一条 = `static/voice/<key>.mp3` 的存在凭证，运行时用 `voiceKey(text)` 算 key 再查这里。
 *
 * 为什么把"有哪些音频"编进代码而不是运行时读目录：
 * App 端读 static 目录要原生 API，Android 7 盒子上各厂商实现不一；
 * 而几百个 8 位字符串编进包里只有几 KB，查询是一次数组线性查找，零 IO 零失败。
 */

/** 已生成音频的 key 列表（共 {len(keys)} 条） */
export const VOICE_KEYS: Array<string> = [
{body}
]
'''
    with open(INDEX, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--concurrency", type=int, default=5)
    args = ap.parse_args()

    with open(SCRIPT, encoding="utf-8") as f:
        data = json.load(f)

    items = data["items"]
    if args.limit:
        items = items[: args.limit]

    print(f"待处理 {len(items)} 条（并发 {args.concurrency}）")

    if args.dry_run:
        role_cnt = {}
        for it in items:
            role_cnt[it.get("role", DEFAULT_ROLE)] = role_cnt.get(it.get("role", DEFAULT_ROLE), 0) + 1
        for k, v in sorted(role_cnt.items()):
            print(f"  {k:<8} {v}")
        for it in items[:5]:
            key = voice_key(clean(it["text"]))
            v, r, p = VOICE_TABLE.get(it.get("role", DEFAULT_ROLE))
            print(f"  {key}  {v} {r} {p}  {it['text'][:24]}")
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    sem = asyncio.Semaphore(args.concurrency)

    done = 0
    ok = cached = fail = 0
    fails = []
    tasks = [synth_one(sem, it, args.force) for it in items]
    for coro in asyncio.as_completed(tasks):
        status, key, err = await coro
        done += 1
        if status == "ok":
            ok += 1
        elif status == "cached":
            cached += 1
        elif status == "fail":
            fail += 1
            fails.append(err)
        if done % 25 == 0 or done == len(items):
            print(f"  进度 {done}/{len(items)}  新生成 {ok}  已有 {cached}  失败 {fail}", flush=True)

    if fails:
        print("\n失败样例：")
        for e in fails[:5]:
            print("  " + e)

    # 索引按目录里**实际存在**的文件来写：这样即使本次只跑了一部分，
    # 之前生成的音频也不会从索引里消失
    keys = []
    for f in os.listdir(OUT_DIR):
        if f.endswith(".mp3") and os.path.getsize(os.path.join(OUT_DIR, f)) > 800:
            keys.append(f[:-4])
    write_index(keys)

    total_mb = sum(os.path.getsize(os.path.join(OUT_DIR, k + ".mp3")) for k in keys) / 1024 / 1024
    print(f"\n完成：新增 {ok}，复用 {cached}，失败 {fail}")
    print(f"索引 {len(keys)} 条，音频包 {total_mb:.1f} MB -> {INDEX}")


if __name__ == "__main__":
    asyncio.run(main())
