#!/usr/bin/env bash
# NetOpsPlatform —— 多 IP 轮换 + 自动重试的 GitHub 推送器
#
# 背景：本机到 github.com 的链路时断时续（HTTP/2 ALPN 被阻断、TCP 偶发 RST、
# 部分 IP 段整段不可达）。单一 IP 必然时灵时不灵。
# 本脚本 = 强制 HTTP/1.1 + 禁用代理 + 多 IP 轮换 + 指数退避重试。
#
# 用法：
#   ./gp.sh              # 推送当前分支
#   ./gp.sh main         # 推送指定分支
#   ./gp.sh main --force # 强制推送
#
# 仓库级配置见 .git/config（http.version / curloptResolve / proxy 等）。

set -uo pipefail
cd "$(dirname "$0")" || exit 1

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
FORCE=""
for a in "$@"; do
  case "$a" in
    --force) FORCE="--force" ;;
    *) [ "$a" != "" ] && BRANCH="$a" ;;
  esac
done

# 实测可用的 GitHub 节点池（含 GitHub 官方 web 网段内的多个机房）
IPS=(
  "140.82.114.4"
  "20.27.177.113"
  "140.82.112.4"
  "140.82.116.3"
  "140.82.113.5"
  "20.205.243.166"
)

MAX_ROUND=8
echo ">> 推送 origin/${BRANCH} ${FORCE}（${MAX_ROUND} 轮 × ${#IPS[@]} 个 IP 轮换）"

for round in $(seq 1 ${MAX_ROUND}); do
  for ip in "${IPS[@]}"; do
    printf ">> [轮 %s] 尝试 IP %s ... " "$round" "$ip"
    if GIT_TERMINAL_PROMPT=0 timeout 90 git \
        -c http.version=HTTP/1.1 \
        -c http.proxy= -c https.proxy= \
        -c "http.curloptResolve=+github.com:443:${ip}" \
        -c http.lowSpeedLimit=1 -c http.lowSpeedTime=300 \
        -c http.postBuffer=524288000 \
        push ${FORCE} -u origin "${BRANCH}" > /tmp/gp_out.txt 2>&1; then
      echo "✓ 成功"
      cat /tmp/gp_out.txt
      echo ">> ✓ 推送完成（IP ${ip}）"
      exit 0
    fi
    err=$(tail -1 /tmp/gp_out.txt | sed 's/.*: //' | cut -c1-40)
    echo "✗ ${err}"
  done
  wait=$((round * 3))
  echo ">> 本轮全部失败，等待 ${wait}s 后进入下一轮..."
  sleep $wait
done

echo ">> ✗ ${MAX_ROUND} 轮后仍未成功。稍后重试，或改用 SSH：git@github.com（见 README 说明）"
exit 1
