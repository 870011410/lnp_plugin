# NocoBase 3 子应用权限目录与翻译桥接插件

`@lifewit/app-plugin-authorization-bridge` 向主应用提供子应用的页面权限清单、Collection 标题和多语言字典。子应用安装并注册插件后，主应用读取字典，按用户语言显示权限标题。

## 可直接给 AI 的提示词

### 子应用接入

```text
请在当前 NocoBase 3 子应用接入 @lifewit/app-plugin-authorization-bridge，直接修改并验证代码。

应用信息：
- 插件：@lifewit/app-plugin-authorization-bridge，版本 1.0.0
- registry：http://192.168.20.172:8081/repository/lnp-plugin/
- appId：复用现有配置或主应用约定；首次接入且没有约定时，列出需要补充的标识，不照搬示例值。

先读仓库 AGENTS.md；安装后阅读插件 README.md、server/index.d.ts 和随包的 skills/nocobase-authorization-bridge/SKILL.md。

1. 在应用根目录执行 pnpm add @lifewit/app-plugin-authorization-bridge@1.0.0 --save-exact --registry=http://192.168.20.172:8081/repository/lnp-plugin/，加入 dependencies 并更新 lockfile，不修改全局 registry。
2. 复用真实页面权限清单，ID 与路由一致并去重，只包含 page 权限，排除 skip、分组和 settings 资源。
3. 在 server/plugins.ts 的现有 defineServerPlugins 列表注册一次 createAuthorizationBridge({ appId, appVersion, pages, localeNamespace, locales })。版本和 namespace 取本应用 package.json，locales 使用已导入的资源对象。
4. 补齐缺失词条，校对页面、资源、动作、范围和 Collection 的 { key, ns } 标题。复用现有字段显示映射，不另写字典展平逻辑。
5. 检查实际所需接口的认证、授权和 API Key scope；保留原有授权 ID、角色和分配，不自动创建生产凭据或扩大用户权限。
6. 在 tests/ 验证 metadata 的认证拒绝、授权拒绝和成功响应，以及中英文字典、页面清单、动态 Collection 标题；使用 Key 时补测 scope 与撤销。只运行受影响范围的检查。

保留工作区已有改动，不重复注册插件。交付时逐文件列出所有新增、修改和删除的代码、测试、依赖及文档，给出完整路径、改动点和对应代码片段或 diff，不用目录名或通配符省略。另列已验证行为和未验证项，说明主应用还需消费 metadata.messages 才能显示翻译。
```

随包 AI 规范见 [SKILL.md](./skills/nocobase-authorization-bridge/SKILL.md)。

## 接入与代码改动

### 本仓库实际改动清单

以下路径相对本仓库根目录，列出本次插件化与翻译增强的全部改动文件。插件内部实现随安装包提供，其他子应用接入时主要调整应用配置与测试。

| 文件                                                                         | 具体改动                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/authorization-bridge/server/index.js`                               | 新增 `createAuthorizationMessages()` 展平字典；`createAuthorizationBridge()` 支持 `localeNamespace` / `locales` 并校验配置；metadata 从实时 Collection 注册表返回 `{ name, title }`。 |
| `plugins/authorization-bridge/server/index.d.ts`                             | 导出 `AuthorizationMessages`、`AuthorizationLocaleResources` 和消息生成函数类型，扩展 `AuthorizationBridgeOptions`。                                                                  |
| `server/authorization-messages.ts`                                           | 导出 `authorizationLocales`，使用插件的 `createAuthorizationMessages()` 替代应用内的递归展平逻辑。                                                                                    |
| `server/plugins.ts`                                                          | 将原来的 `messages` 配置调整为 `localeNamespace: packageMetadata.name` 和 `locales: authorizationLocales`。                                                                           |
| `shared/authorization-pages.ts`                                              | 将固定中文页面标题改为 `{ key: 'warehouses.title', ns: packageMetadata.name }`，保留页面 ID。                                                                                         |
| `tests/logic/authorization-bridge.test.ts`                                   | 增加动态 Collection 标题、`Cache-Control: no-store` 和 OpenAPI 契约一致性断言，保留认证授权验证。                                                                                     |
| `tests/logic/authorization-messages.test.ts`                                 | 增加其他应用 namespace、插件 overrides、非字符串过滤和配置冲突验证。                                                                                                                  |
| `docs/authorization/api.md`                                                  | 补充 `collections`、字典结构及标题合并规则。                                                                                                                                          |
| `docs/authorization/openapi.json`                                            | 补充 metadata 的 `collections` 响应 schema。                                                                                                                                          |
| `plugins/authorization-bridge/skills/nocobase-authorization-bridge/SKILL.md` | 补充插件字典生成、实时 Collection 标题和旧协议回退约定。                                                                                                                              |
| `.agents/rules/lbp-authentication.md`                                        | 记录桥接插件与应用 locale、原生权限注册的职责。                                                                                                                                       |
| `plugins/authorization-bridge/README.md`                                     | 整理 AI 提示词、完整改动清单、接入示例、原理和接口。                                                                                                                                  |

### 其他子应用需要检查的文件

本仓库以下文件已有对应配置，本次直接复用；其他子应用按实际缺项修改。业务文件名以目标应用为准，新增或修改时也应在交付清单逐文件列明。

| 文件                                                 | 接入时的处理                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `package.json`、`pnpm-lock.yaml`                     | 安装 `1.0.0` 到 `dependencies` 并更新锁文件；本仓库已有插件本地依赖。                                                        |
| `client/locales/en-US.ts`、`client/locales/zh-CN.ts` | 提供页面、资源、动作、范围和字段的中英文词条，补齐缺项。                                                                     |
| `client/routes.ts`                                   | 校对 `authz.resource.id` 与页面清单一致，保留已有授权 ID。                                                                   |
| `server/providers/warehouse-resources.ts`            | 本仓库业务资源、动作和数据范围的翻译描述符注册位置。                                                                         |
| `server/providers/warehouses/index.ts`               | 本仓库 `registerWarehousePermissions()` 注册 Collection 的 `{ name, title }`。                                               |
| `server/middlewares/lbp-session.ts`                  | 本仓库允许已验证的服务账号 Key 访问 metadata 和 permissionSets 路径，仍保留原生授权与 scope 校验；defaultAccess 需单独核对。 |
| `tsconfig.json`、`tsconfig.server.json`              | 新增 `shared` 清单时确保客户端、服务端均包含 `shared/**/*.ts`。                                                              |

### 1. 页面权限清单

复用已有页面 ID，下面的库存页面仅作示例：

```ts
// shared/authorization-pages.ts
import packageMetadata from '../package.json' with { type: 'json' };

export const permissionPages = [
  {
    id: 'inventory.warehouses',
    title: { key: 'warehouses.title', ns: packageMetadata.name },
  },
];
```

`id` 对应路由的 `authz.resource.id`，同一 ID 只列一次；只包含真实的 `page` 权限，排除 `authz: 'skip'`、分组路由和 `settings` 资源。

### 2. 服务端注册

在现有 `server/plugins.ts` 中追加插件，保留原有注册项、`defineServerPlugins` 导入和默认导出：

```ts
import { createAuthorizationBridge } from '@lifewit/app-plugin-authorization-bridge/server';
import packageMetadata from '../package.json' with { type: 'json' };
import enUS from '../client/locales/en-US.js';
import zhCN from '../client/locales/zh-CN.js';
import { permissionPages } from '../shared/authorization-pages.js';

const serverPlugins = defineServerPlugins([
  // 保留现有插件，在原有数组中追加以下条目。
  createAuthorizationBridge({
    appId: 'inventory-management',
    appVersion: packageMetadata.version,
    pages: permissionPages,
    localeNamespace: packageMetadata.name,
    locales: { 'en-US': enUS, 'zh-CN': zhCN },
  }),
]);
```

- `appId` 使用主应用约定的稳定标识，已有配置保留原值。格式为 2–64 个小写字母、数字或连字符，以字母开头。
- `localeNamespace` 与标题的 `ns` 一致，通常取 `package.json.name`。`locales` 传已导入的资源对象，不传动态 loader；其中所有字符串都会导出，应只包含可对外展示的文案。
- 词条与标题对应，例如 `warehouses.title` 在中英文资源中分别为“仓库管理”和“Warehouses”。Collection 标题在原有注册处设置为同样的 `{ key, ns }` 描述符。

本插件只需 Server 注册，不需要 Client、CLI 或数据库改动。已有预生成 `messages` 的应用可继续使用，但不能同时传入 `locales`。

## 实现原理

1. 注册时调用 `createAuthorizationMessages(localeNamespace, locales)`，把字符串叶子展平为 `messages[locale]['namespace:key']`；`overrides` 使用被覆盖插件的 namespace。
2. `GET /api/authorizationBridge/metadata` 返回页面清单、字典，以及从 `authz.database.collections.list()` 实时读取的 Collection 标题。页面和字典在注册时生成，修改后需重新加载服务端插件。
3. 主应用结合原生权限 options，按当前语言解析 `{ key, ns, defaultValue? }`。metadata 返回全部配置语言，不按 `Accept-Language` 改写响应。

原生 Authorization 继续负责角色、授权和权限校验。字段 ID 的显示需要显式映射，插件不会自动推断字段翻译，也不会自动收集其他插件的 client locale。

实现见 [server/index.js](./server/index.js)，配置类型见 [server/index.d.ts](./server/index.d.ts)。

## 涉及翻译的接口

下列路径均需加上实际应用 base path。

| 接口                                                       | 提供方与翻译位置                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/authorizationBridge/metadata`                    | 本插件新增；返回 `data.pages`、`data.collections`、`data.messages`。       |
| `GET /api/authorization/permissionSets/options`            | 子应用原生接口；保留标题描述符，结合 metadata 字典显示。                   |
| `GET /api/authorization/defaultAccess/options`             | 子应用原生 Default Access 接口；结合 metadata 字典显示，需单独注册该能力。 |
| `GET /api/authorizationApps/{appId}/permissionOptions`     | 当前主应用的聚合接口；字典在 `data.metadata.messages`。                    |
| `GET /api/authorizationApps/{appId}/defaultAccess/options` | 当前主应用的聚合接口；目录在 `data`，字典在响应顶层 `messages`。           |

桥接插件只新增 metadata 接口，不改写子应用原生接口；最后两项由主应用的远程授权模块提供。

metadata 要求认证及 `settings:authorization.permission-sets/read` 授权，API Key 同时受 scope 限制。额外平台认证须逐路径核对，不能只凭存在 `x-api-key` 头就放行。

## 主应用如何读取翻译

1. 服务端读取原生 options 和 metadata，校验 `appId`、`protocolVersion` 及响应结构；服务凭据保留在服务端。
2. 页面目录使用 `pages`；Collection 标题按精确 `name` 补充到已有 options，保留已有标题，不新增权限资源或改变授权值。
3. 将 `messages` 传给 UI，按用户当前 locale 查找；缺项时回退到现有 i18n：

```ts
const label =
  typeof title === 'string'
    ? title
    : (messages?.[locale]?.[`${title.ns ?? ''}:${title.key}`] ??
      t(title.key, {
        ns: title.ns,
        defaultValue: title.defaultValue ?? title.key,
      }));
```

消费端需兼容旧 metadata 缺少 `messages` / `collections` 的情况。显示翻译不改变资源 ID、字段 ID 或保存的授权数据。

## 接入验证

使用已有凭据请求 metadata；`CHILD_BASE_URL` 包含应用 base path，末尾不带斜杠：

```bash
curl --fail-with-body \
  -H "x-api-key: ${CHILD_API_KEY}" \
  "${CHILD_BASE_URL}/api/authorizationBridge/metadata"
```

确认未认证、无权限请求被拒绝，有授权时返回页面清单和字典；主应用切换中英文后标题更新，缺失词条能回退。404 检查注册和 base path，401/403 检查凭据与授权，显示 key 时检查 namespace、locale 和字典传递。
