import type enUS from './en-US.js';

const pluginManager: { [K in keyof typeof enUS]: (typeof enUS)[K] } = {
  title: '插件管理',
  description: '构建、打包和发布自开发的 NocoBase 3 插件。',
  repository: '插件仓库',
  repositoryDescription: '发布到 hosted 仓库，通过 group 仓库安装和下载。',
  publishTarget: '发布仓库',
  downloadTarget: '下载仓库',
  tokenConfigured: '服务端已配置发布 Token。',
  npmCredentials:
    '发布使用服务端当前用户的 npm 登录信息。若认证失败，请在服务端登录此 hosted 仓库。',
  localPlugins: '本地插件',
  sourceHint:
    '管理当前应用 packages 目录中的插件。发布前先构建打包；私有插件可以打包，上传前需允许发布并重新打包。',
  empty: '暂无本地 NocoBase 3 插件。将插件加入 packages 目录后刷新。',
  plugin: '插件',
  version: '版本',
  capabilities: '能力',
  publication: '发布设置',
  private: '私有',
  publishable: '可发布',
  actionsFor: '{{name}} 的操作',
  downloadFor: '下载 {{name}}',
  capability: { client: '客户端', server: '服务端', cli: '命令行' },
  pack: '构建并打包',
  publish: '发布',
  refresh: '刷新',
  retry: '重试原请求',
  queued: '发布任务已加入队列',
  history: '发布记录',
  historyDescription:
    '下载打包产物，或发布同一个归档文件。服务中断后不会自动重新发布。',
  noHistory: '暂无打包或发布任务。',
  createdAt: '创建时间',
  operation: '操作',
  statusLabel: '状态',
  publishConfirm: '确认发布插件？',
  publishDescription:
    '将 {{name}}@{{version}} 发布到 {{registry}}。已有版本不能覆盖；发布新版本请先修改版本号并重新打包。',
  status: {
    queued: '排队中',
    building: '构建中',
    packing: '打包中',
    publishing: '发布中',
    succeeded: '成功',
    failed: '失败',
  },
  errors: {
    COMMAND_FAILED: '操作失败，请检查插件构建和打包配置后重试。',
    TOOL_UNAVAILABLE: '应用服务端无法使用 Node.js、pnpm 或 npm。',
    INVALID_REGISTRY: '请配置不包含用户名或密码的有效 npm 仓库 URL。',
    PLUGIN_NOT_FOUND: '本地插件已不存在，请刷新列表。',
    RUN_NOT_FOUND: '找不到此发布任务。',
    ARTIFACT_REQUIRED: '请先成功构建并打包插件，再发布。',
    BUILD_SCRIPT_REQUIRED: '插件的 package.json 必须声明 build 脚本。',
    PLUGIN_BUSY: '此插件已有任务进行中，请等待任务完成。',
    OPERATION_CONFLICT: '此请求标识已用于其他操作，请检查发布记录。',
    INVALID_OPERATION_KEY: '操作标识无效，请重新加载页面后重试。',
    REGISTRY_UNAVAILABLE: '无法连接插件仓库，请检查仓库地址和网络。',
    REGISTRY_READ_ONLY:
      '这是只读的 group 或 proxy 仓库，请选择 npm hosted 仓库发布。',
    ARTIFACT_CHANGED: '归档文件与打包时的校验值不一致，请重新打包。',
    INTERRUPTED: '服务在任务执行期间停止。重试发布前请先检查仓库中的版本。',
    SOURCE_CHANGED: '插件名称或版本在打包期间发生变化，请重新打包。',
    BUILD_FAILED: '插件构建失败，请在终端运行插件的 build 脚本查看编译输出。',
    INVALID_ARTIFACT: '归档无效，或包含凭据、链接及不支持的文件。',
    ARTIFACT_TOO_LARGE: '插件包超过 100 MB 上传限制。',
    MISSING_BUILD_OUTPUT:
      '归档必须导出 dist 中实际存在的编译文件，请检查 files 和 publishConfig.exports。',
    PRIVATE_PACKAGE:
      '归档中的插件为私有包，请将 private 设为 false 后重新打包再发布。',
    AUTHENTICATION_FAILED:
      '仓库认证失败，请配置发布 Token 或在服务端运行 npm login。',
    PUBLISH_FAILED:
      '未确认发布成功，请检查仓库权限及此版本是否已存在后再重试。',
    REGISTRY_MISMATCH:
      '插件的 publishConfig.registry 与配置的 hosted 发布仓库不一致。',
  },
};
export default pluginManager;
