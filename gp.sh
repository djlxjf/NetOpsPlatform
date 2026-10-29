#!/usr/bin/env bash
# NetOpsPlatform —— 稳定的 GitHub 推送包装器
#
# 为什么需要它：
#   本机到 github.com 的直连链路存在间歇性中断（HTTP/2 ALPN 协商被阻断、
#   TCP 偶发 RST）。单次 git push 有概率报 "Empty reply from server" /
#   "Recv failure: Connection was reset" / "CONNECT tunnel failed 502"。
#   本脚本 = 正确网络参数 + 自动重试，把偶发失败变成"最终一定成功"。
#
# 用法：
#   ./gp.sh              # 推送当前分支
#   ./gp.sh main         # 推送指定分支
#   ./gp.sh --force      # 强制推送（谨慎）
#
# 已固化的仓库级配置（.git/config）：
#   http.version        = HTTP/1.1   ← 绕开被阻断的 HTTP/2 协商
#   http.curloptResolve = github.com → 140.82.114.4（实测可用节点）
#   http.proxy          = ""         ← 走直连，绕开不稳定的沙箱代理
#   http.lowSpeedLimit/Time = 1/300  ← 慢速链路不误判为失败

set -uo pipefail

cd "$(dirname "$0")" || exit 1

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
[ "$BRANCH" = "--force" ] && { BRANCH="$(git rev-parse --abbrev-ref HEAD)"; FORCE="--force"; }
FORCE="${FORCE:-}"
[ "${2:-}" = "--force" ] && FORCE="--force"

MAX=6
echo ">> 推送到 origin/${BRANCH} ${FORCE}（最多重试 ${MAX} 次）"

for i in $(seq 1 ${MAX}); do
  if GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 \
      -c http.proxy= -c https.proxy= \
      -c http.curloptResolve="+github.com:443:140.82.114.4" \
      -c http.lowSpeedLimit=1 -c http.lowSpeedTime=300 \
      -c http.postBuffer=524288000 \
      push ${FORCE} -u origin "${BRANCH}" 2>&1; then
    echo ">> ✓ 推送成功（第 ${i} 次尝试）"
    exit 0
  fi
  echo ">> 第 ${i} 次失败（网络瞬断），${i} 秒后重试..."
  sleep $((i * 2))
done

echo ">> ✗ 重试 ${MAX} 次仍未成功。检查网络后手动执行：git push -u origin ${BRANCH}"
exit 1
