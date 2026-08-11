#!/bin/zsh

set -euo pipefail

readonly SCRIPT_DIR="${0:A:h}"
readonly PROJECT_DIR="${SCRIPT_DIR:h}"
readonly PORT="8790"
readonly APP_URL="http://127.0.0.1:${PORT}"
readonly NODE_BIN="/opt/homebrew/bin/node"
readonly TSX_CLI="${PROJECT_DIR}/node_modules/tsx/dist/cli.mjs"
readonly LOG_DIR="${HOME}/Library/Logs"
readonly LOG_FILE="${LOG_DIR}/模型验真台.log"
readonly LABEL="com.longjianw.relaybench-cn"
readonly PLIST_FILE="${HOME}/Library/LaunchAgents/${LABEL}.plist"
readonly DOMAIN="gui/$(/usr/bin/id -u)"

health_check() {
  /usr/bin/curl --silent --fail --max-time 2 "${APP_URL}/api/system" >/dev/null 2>&1
}

if health_check; then
  exit 0
fi

if /usr/sbin/lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  print -u2 "端口 ${PORT} 已被其他程序占用，模型验真台无法启动。"
  exit 2
fi

if [[ ! -x "${NODE_BIN}" ]]; then
  print -u2 "没有找到本机 Node.js：${NODE_BIN}"
  exit 3
fi

if [[ ! -f "${TSX_CLI}" ]]; then
  print -u2 "项目依赖不完整，请先在模型验真台目录运行 npm install。"
  exit 4
fi

if [[ ! -f "${PROJECT_DIR}/dist/index.html" ]]; then
  print -u2 "网页尚未构建，请先在模型验真台目录运行 npm run build。"
  exit 5
fi

/bin/mkdir -p "${LOG_DIR}" "${HOME}/Library/LaunchAgents"

if /bin/launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  /bin/launchctl bootout "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || true
fi

program_arguments=$("${NODE_BIN}" -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' \
  "${NODE_BIN}" "${TSX_CLI}" "${PROJECT_DIR}/server/index.ts")

/usr/bin/plutil -create xml1 "${PLIST_FILE}"
/usr/bin/plutil -insert Label -string "${LABEL}" "${PLIST_FILE}"
/usr/bin/plutil -insert ProgramArguments -json "${program_arguments}" "${PLIST_FILE}"
/usr/bin/plutil -insert WorkingDirectory -string "${PROJECT_DIR}" "${PLIST_FILE}"
/usr/bin/plutil -insert RunAtLoad -bool true "${PLIST_FILE}"
/usr/bin/plutil -insert ProcessType -string Background "${PLIST_FILE}"
/usr/bin/plutil -insert StandardOutPath -string "${LOG_FILE}" "${PLIST_FILE}"
/usr/bin/plutil -insert StandardErrorPath -string "${LOG_FILE}" "${PLIST_FILE}"
/usr/bin/plutil -insert EnvironmentVariables -json \
  '{"PATH":"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin","PORT":"8790","NODE_ENV":"production"}' \
  "${PLIST_FILE}"

/bin/launchctl bootstrap "${DOMAIN}" "${PLIST_FILE}"

for _ in {1..40}; do
  if health_check; then
    exit 0
  fi
  /bin/sleep 0.25
done

/bin/launchctl bootout "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || true
print -u2 "模型验真台启动超时。日志位置：${LOG_FILE}"
exit 6
