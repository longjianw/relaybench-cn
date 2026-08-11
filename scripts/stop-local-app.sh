#!/bin/zsh

set -euo pipefail

readonly LABEL="com.longjianw.relaybench-cn"
readonly DOMAIN="gui/$(/usr/bin/id -u)"

if /bin/launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  /bin/launchctl bootout "${DOMAIN}/${LABEL}"
  print "模型验真台后台服务已停止。"
else
  print "模型验真台后台服务当前未运行。"
fi
