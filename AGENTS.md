保证代码的正交性和代码风格一致，以及数据流的单向流通
use pnpm 而不是 npm 来进行包管理，如果已经有相关的了，迁移到pnpm里
执行之前先去 ./docsforcodex 文件夹里面查看文档，overall.md 文件是项目的整体布局，你在修改代码的时候需要更新并审查相关 文档文件是否符合代码事实，不符合则及时更新，这是一个抽象，你以后可以通过overall.md 文件来快速的把握项目

## CI/CD 与发布治理约束

- 当前仓库的正式发布事实源是远端受保护的 `main`，不是开发者本地分支状态。
- 日常开发默认走 feature branch + PR；不要把本地 `main` 当作日常开发工作台。
- 正式 release tag 只允许通过远端 GitHub Actions workflow `create-release-tag.yml` 创建。
- `pnpm release:prepare -- --tag <tag>` 是正式 release 的唯一本地入口；它只允许做本地校验并 dispatch 远端 workflow。
- 禁止恢复或新增本地正式发版 fallback，例如：
  - `release:prepare-local`
  - 本地 `commit/push main/tag`
  - 手工 `git tag <tag> && git push origin <tag>` 作为默认发版路径
- `pnpm release:prepare` 必须保持以下约束：
  - 当前分支是 `main`
  - 工作树干净
  - `origin/main` 与本地 `HEAD` 一致
  - 目标 tag 是一个此前未使用过的无 `v` 语义化版本
- 正式发布前，版本同步必须先通过 PR 合入 `main`，再触发 `create-release-tag.yml`。
- `release-desktop.yml` 只消费“新 tag push”，不负责同步版本文件，也不应回写 `main`。
- 如果后续再次调整 CI/CD 或发布流程，必须同时同步：
  - `README.md`
  - `docsforcodex/overall.md`
  - `docsforcodex/action-cicd-release-flow.md`
  - `docsforcodex/local-cicd-orchestration.md`
  - `docsforcodex/codex-local-setup-and-release.md`
  - `docforcodex/hole/release-cicd/release-cicd-errors-and-pitfalls.md`
  - 相关 `openspec/changes/*`
- 如果遇到 `ahead/behind`、旧 tag 复用、workflow dispatch 读到旧 ref、branch protection、required checks、tag protection 相关问题，优先把它们视为“发布事实源”问题，而不是简单的 Git 命令问题。

每次遇到错误、踩坑、环境问题、CI/CD 问题、工作流陷阱、脚本参数陷阱时，都必须把“现象、报错原文、根因、解决路径、验证方式、后续防回归建议”落库到 `./docforcodex/hole` 下面对应的坑点子文件夹里。

落库规则：
- `./docforcodex/hole/<坑点主题>/` 一个主题一个文件夹
- 同类问题优先更新已有文档，不要重复新建多份割裂记录
- 至少包含：错误现象、根因、修复方式、验证结果、相关文件路径
- 如果代码、脚本、workflow、发布流程再次修改，必须同步订正对应的 hole 文档以及相关说明文档，保持“代码事实”和“文档事实”一致
- 如果新增了新的坑点文档，同时要检查 `./docsforcodex/overall.md` 和相关专题文档是否需要同步更新
