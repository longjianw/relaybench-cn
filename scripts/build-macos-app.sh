#!/bin/zsh

set -euo pipefail

readonly SCRIPT_DIR="${0:A:h}"
readonly PROJECT_DIR="${SCRIPT_DIR:h}"
readonly TEMPLATE_PATH="${SCRIPT_DIR}/模型验真台.applescript"
readonly LAUNCHER_PATH="${SCRIPT_DIR}/start-local-app.sh"
readonly APP_PATH="${HOME}/Desktop/模型验真台.app"
readonly NODE_BIN="/opt/homebrew/bin/node"

if [[ ! -x "${NODE_BIN}" ]]; then
  print -u2 "没有找到本机 Node.js：${NODE_BIN}"
  exit 1
fi

temporary_script=$(/usr/bin/mktemp -t relaybench-applescript)
trap '/bin/rm -f "${temporary_script}"' EXIT

"${NODE_BIN}" -e '
  const fs = require("node:fs");
  const [templatePath, outputPath, launcherPath] = process.argv.slice(1);
  const template = fs.readFileSync(templatePath, "utf8");
  fs.writeFileSync(outputPath, template.replace("__LAUNCHER_PATH__", launcherPath), "utf8");
' "${TEMPLATE_PATH}" "${temporary_script}" "${LAUNCHER_PATH}"

if [[ -L "${APP_PATH}" ]]; then
  /bin/rm "${APP_PATH}"
elif [[ -e "${APP_PATH}" ]]; then
  backup_path="${HOME}/Desktop/模型验真台.app.backup-$(/bin/date +%Y%m%d-%H%M%S)"
  /bin/mv "${APP_PATH}" "${backup_path}"
fi

/usr/bin/osacompile -o "${APP_PATH}" "${temporary_script}"
print "已安装：${APP_PATH}"
