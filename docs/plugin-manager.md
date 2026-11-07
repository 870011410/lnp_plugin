# 自开发插件管理

管理员访问“系统设置 → 系统 → 插件管理”。仅无限制管理员可访问页面和 API。插件源码放在应用 `packages/<目录名>/` 中，包名使用 `app-plugin-*` 或 `@scope/app-plugin-*`，并声明 NocoBase 3 的 `./client`、`./server` 或 `./cli` exports 和 `build` 脚本。使用项目内插件开发 Skill 和 `pnpm create @nocobase/plugin@beta` 创建插件；本功能不会自动执行安装、注册或启用插件。

1. 将插件放入 `packages/`，安装其依赖，刷新列表。
2. 从插件行的操作菜单选择“构建并打包”。后台执行 `pnpm run build`，然后执行禁用生命周期脚本的 `pnpm pack`。
3. 在发布记录中下载成功的 `.tgz`，或点击“发布”确认名称、版本和目标仓库。上传校验并复用原归档，不重新构建。
4. 新版本需先修改插件版本号再打包。打包允许 `private: true`，发布要求归档中的 `private` 为 false；修改后需要重新打包。

打包产物必须包含 exports 指向的文件，运行时导出必须指向 `dist/`。推荐在 `publishConfig.exports` 中声明编译后的导出，在 `files` 中仅包含发布文件。归档中禁止 `.npmrc`、`.env*`、`config.yml`、`node_modules` 和符号链接，压缩包上限为 100 MB。失败记录显示可操作的错误原因，构建输出不会发送到浏览器或写入任务 JSON；构建失败时在插件目录运行 `pnpm run build` 查看详细编译输出。

## Nexus 配置与认证

发布地址为 `http://192.168.20.172:8081/repository/lnp_nocobase_plugin/`，已通过 Nexus API 确认为 npm hosted。`http://192.168.20.172:8081/repository/lnp-plugin/` 是 npm group，只用于安装和下载；要通过 group 下载新发布的插件，需在 Nexus 管理后台的 Repositories 中将 hosted 仓库加入此 group 的成员列表。仓库页面的 URL 就是 npm registry URL。

配置在服务端 `server/config/plugin-manager.ts` 声明，可在本地 `config.yml` 覆盖：

```yaml
pluginManager:
  registry: http://192.168.20.172:8081/repository/lnp_nocobase_plugin/
  downloadRegistry: http://192.168.20.172:8081/repository/lnp-plugin/
```

环境变量 `LNP_PLUGIN_REGISTRY` 和 `LNP_PLUGIN_DOWNLOAD_REGISTRY` 可覆盖上述地址。认证任选一种：

- 在运行应用的同一操作系统用户下执行 `npm login --auth-type=legacy --registry=http://192.168.20.172:8081/repository/lnp_nocobase_plugin/`，交互输入有发布权限的 Nexus 账号。npm 将登录信息保存在该用户的 npm 配置中。
- 通过服务端环境变量 `LNP_PLUGIN_NPM_TOKEN` 注入此仓库的 npm Bearer token。Nexus 需启用 npm Bearer Token Realm；不要将普通 Nexus 密码当作 Bearer token。应用创建仅限目标 registry 路径的临时认证文件，发布后删除。

应用不接收浏览器上传的账号密码，也不将 token 返回前端。发布前会验证仓库类型和 `npm whoami`；需要 Nexus 账号具备 hosted 仓库的读取、添加和编辑权限。若包内 `publishConfig.registry` 与应用配置不同，发布被拒绝。预发布版本使用 `beta` tag，其他版本使用 `latest`。真实 Nexus 发布仍需配置可用的认证；自动化测试使用临时本地 registry 验证真实 npm 协议，不向 Nexus 写入测试包。

## 命令行与存储

```sh
pnpm nocobase app plugins list --json
pnpm nocobase app plugins pack <packages目录名> --dry-run --json
pnpm nocobase app plugins pack <packages目录名> --json
pnpm nocobase app plugins publish <成功打包任务ID> --dry-run --json
pnpm nocobase app plugins publish <成功打包任务ID> --json
```

任务与归档保存在应用 storage 下的 `plugin-manager/runs/`，插件锁在 `plugin-manager/locks/`。操作请求必须提供 `Idempotency-Key`；相同请求重试返回原任务，避免重复构建或发布。任务可处于排队、构建、打包、发布、成功、失败状态；应用重启将未结束任务标为中断，不自动重试发布，因为远端可能已经接收该版本。

该管理器面向单进程本地源码开发环境，使用文件历史和本地插件锁。不要让多个应用进程或其他进程的 CLI 同时使用同一 storage；运行 CLI 发布前应停止应用，完成后重新启动。生产部署通常不包含源码和 pnpm，插件应在开发环境打包、发布并按 NocoBase 3 的标准流程安装注册。备份 storage 可保留历史和归档；按团队保留周期离线清理已结束任务目录，保留仍需发布的归档。
