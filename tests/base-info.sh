#!/usr/bin/env bash
# 查看工程的标准基座 / 自定义基座状态
# 用法：bash tests/base-info.sh
#
# 判断依据：
#   custom.exists = false  → 当前只能用标准基座（io.dcloud.uniappx），
#                            标准基座里没有本项目自己的 UTS 插件，TTS 不会出声
#   custom.exists = true   → 自定义基座已就绪，运行时要选「自定义调试基座」才生效
set -o pipefail
HX="/d/uni_app_Tool/HBuilderX/cli.exe"
PROJ="D:/uni-appx_TestPro/SuanSuanXiaoDaRen_New"

"$HX" base info --project "$PROJ" --platform android 2>&1 | tail -3
