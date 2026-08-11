# 第一次维护 GitHub 项目

这份说明面向第一次拥有自己仓库的维护者。

## 五个核心概念

- **Repository（仓库）**：项目文件和全部版本历史。
- **Commit（提交）**：一次带说明的版本快照。
- **Push（推送）**：把本机提交上传到GitHub。
- **Branch（分支）**：不影响主版本的独立修改线路。
- **Issue（议题）**：记录缺陷、想法和下一步。

## 日常最小流程

```bash
git status
git diff
git add -- 具体文件名
git commit -m "说明这次改了什么"
git push
```

不要使用不理解的批量操作，也不要把 `.env`、API Key、患者资料、运行日志或本机配置加入提交。

## 在网页上主要看什么

1. 首页README：别人进入项目时首先看到的说明。
2. Commits：每次修改记录。
3. Actions：自动测试是否通过。
4. Issues：待办和问题。
5. Releases：提供可下载版本。

## 第一次公开前检查

- README中的功能和限制与真实状态一致。
- 截图不含姓名、账号、Key、患者信息或本机路径。
- 自动测试与构建通过。
- 仓库历史中从未提交过秘密。
- 对AI辅助开发方式如实说明。

## 维护节奏

不需要每天提交。完成一个可解释的小变化后再提交，并用一句人话说明原因，例如：

```text
Add repeat-run stability metrics
Fix workspace task isolation
Document model identity limitations
```
