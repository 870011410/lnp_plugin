# Authorization Bridge 接入指南

`@lifewit/app-plugin-authorization-bridge@1.0.0` 向主应用提供子应用的页面权限清单、显示文案和 Collection 标题。

接口：`GET <应用路径>/api/authorizationBridge/metadata`。需要登录及 `settings:authorization.permission-sets/read` 权限，匿名返回 401，无权限返回 403。

版本说明：所有 peer dependencies 均不限制版本范围；实际 API 兼容性仍需在目标环境验证。

## AI 接入提示语

```text
请在当前子应用接入 @lifewit/app-plugin-authorization-bridge，固定版本 1.0.0。
Registry：http://192.168.20.172:8081/repository/lnp-plugin/

1. 阅读项目 AGENTS.md、相关 Skill 和实际安装包文档，核对版本与导出。
2. 安装：pnpm add --save-exact @lifewit/app-plugin-authorization-bridge@1.0.0 --registry=http://192.168.20.172:8081/repository/lnp-plugin/
3. 在 server/authorization-bridge.ts 使用 /server 的 createAuthorizationBridge() 配置插件，在 server/plugins.ts 导入并注册到认证和 Authorization 插件之后。
4. 保留现有 routes 和页面文件，不新增 authorization-pages.ts 或共用常量目录。直接在桥接配置填写页面 ID 和标题键，必须与现有路由的 authz.resource.id 和标题键一致；传入对应公开 locale。
5. 保持 appId 稳定，版本与 locale 命名空间取自 package.json。保留本地认证和授权检查，不创建用户、API Key、角色或授权记录。
6. 验证 401、403、200、no-store、页面与双语文案及 OpenAPI，运行定向检查，报告实际改动与版本不兼容情况。
```

## 涉及文件

| 文件                                                                                            | 作用                                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| [package.json](../../../package.json)、[pnpm-lock.yaml](../../../pnpm-lock.yaml)                | 声明并锁定插件版本。                   |
| [server/authorization-bridge.ts](../../../server/authorization-bridge.ts)                       | 维护页面清单与公开文案。               |
| [server/plugins.ts](../../../server/plugins.ts)                                                 | 导入并注册插件，后续增加页面无需修改。 |
| [tests/server/authorization-bridge.test.ts](../../../tests/server/authorization-bridge.test.ts) | 验证接口权限与元数据。                 |

## 注册插件

在 `server/plugins.ts` 增加导入和注册，排在认证、授权插件之后，保留其他插件：

```diff
+import authorizationBridge from './authorization-bridge.js';

 const serverPlugins: AppServerPlugins = defineServerPlugins([
   concurrency,
   authentication,
   authorization,
+  authorizationBridge,
   defaultAccess,
   // 其余现有插件
 ]);
```

## 页面清单怎么写

在 `server/authorization-bridge.ts` 中直接填写现有路由对应的值：

```ts
import { createAuthorizationBridge } from '@lifewit/app-plugin-authorization-bridge/server';
import packageMetadata from '../package.json' with { type: 'json' };
import enUS from '../client/locales/en-US.js';
import zhCN from '../client/locales/zh-CN.js';

const authorizationBridge = createAuthorizationBridge({
  appId: 'nocobase-5',
  appVersion: packageMetadata.version,
  pages: [
    {
      id: 'salesForecast', // 与 routes 中的 authz.resource.id 一致
      title: { key: 'salesForecast.title', ns: packageMetadata.name },
    },
  ],
  localeNamespace: packageMetadata.name,
  locales: {
    'en-US': { salesForecast: enUS.salesForecast },
    'zh-CN': { salesForecast: zhCN.salesForecast },
  },
});

export default authorizationBridge;
```

**对应关系：** `pages[].id` 对应路由的 `authz.resource.id`，不是路由 `name` 或 URL；`title.key` 对应路由现有的导航或面包屑标题键，并能在 locale 中解析。

后续页面开发完成后，只需在此文件的 `pages` 中补充相同 ID 和标题键，并将对应文案组加入两种语言的 `locales`。接入桥接无需调整 routes 或新增页面文件。

`1.0.0` 使用静态清单，不会自动发现路由或跟随条件配置增删。只登记页面权限资源，跳过 `authz: 'skip'` 和设置资源。页面访问权与 API 业务权限分别控制。

## 验证

```bash
pnpm exec vitest run tests/server/lifewit-app-plugin-authorization-bridge.test.ts tests/client/page-permission-titles.test.ts
pnpm exec eslint server/lifewit-app-plugin-authorization-bridge.ts server/plugins.ts tests/server/lifewit-app-plugin-authorization-bridge.test.ts --max-warnings 0
```

确认桥接返回的页面 ID、标题和双语文案正确。生产环境重新构建、部署后，由主应用刷新子应用元数据。
