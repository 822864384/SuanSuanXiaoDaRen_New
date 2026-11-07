#!/usr/bin/env bash
# 用 HBuilderX CLI 只编译（不连设备）验证 uni-app x 工程
# 用法：bash tests/compile-android.sh
# 说明：--compile true 表示「仅编译代码」，无需真机；--continue-on-error true 让所有页面都编译一遍，
#      一次拿到全部报错，而不是逐个修。
set -o pipefail
HX="/d/uni_app_Tool/HBuilderX/cli.exe"
PROJ="D:/uni-appx_TestPro/SuanSuanXiaoDaRen_New"

"$HX" launch app-android --project "$PROJ" --compile true --continue-on-error true 2>&1 | tee /tmp/uvue-compile.log | tail -40

if grep -q "编译成功" /tmp/uvue-compile.log; then
  echo "✅ 编译成功"
  exit 0
fi
echo "❌ 编译失败，报错行："
grep -n -E "error|错误|Error|✗|无法|不支持" /tmp/uvue-compile.log | head -30
exit 1
