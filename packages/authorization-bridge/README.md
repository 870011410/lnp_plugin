# Authorization directory bridge

Reusable NocoBase 3 server plugin for permission plan v2. It exports the child application's public page directory, Collection display titles, translation dictionary and protocol information. Native `authorization/permissionSets` routes provide the live business catalog, roles and assignments; their database and authorization checks stay in the child.

Install the package in each child application's `dependencies`, then register `createAuthorizationBridge(...)` in `server/plugins.ts`. Pass the app's locale resources as `locales` with `localeNamespace: packageMetadata.name`; the bridge builds the public translation dictionary automatically. Existing integrations may continue passing a prebuilt `messages` dictionary. This vendored ESM package requires no build step and can be packed and published independently. The vendor scope currently requires explicit composition, as does the existing LBP plugin; do not alter the CLI to bypass its package allowlist.

`GET <base>/api/authorizationBridge/metadata` requires authentication and `settings:authorization.permission-sets/read`, including API-key scope. It returns `{ data: { appId, protocolVersion: '1', appVersion, pages, capabilities, messages?, collections } }`. With `locales` configured, `messages` contains each locale's public string leaves under `namespace:key` keys. Missing auth returns 401, insufficient rights 403. GET performs no writes. No credential is included. No key, account, role or assignment is created on installation.

Use one shared page manifest for client route `authz.resource.id` and `pages[].id`. Omit routes explicitly marked `authz: 'skip'`. A settings-protected route is not a page resource. `messages` is optional public display text, keyed first by locale and then `namespace:key`; never include private configuration or user information. Business permission options come from the live native registrations rather than this manifest. New registered business actions appear after restarting the child and refreshing the main page.

The bridge does not rewrite the native Authorization responses. `GET /api/authorization/permissionSets/options` and `GET /api/authorization/defaultAccess/options` continue returning `LocalizedText` descriptors. A consumer reads the bridge metadata dictionary and resolves those descriptors using the viewer's locale. Literal page titles remain literal, so use a descriptor such as `{ key: 'warehouses.title', ns: packageMetadata.name }` for translated page labels.

This plugin does not manufacture inventory business operations or bypass local enforcement. Role deletion remains unavailable remotely until the child provides an actual workflow-reference check.

## Permission display translations

Keep application copy in the application's locale files. The public `createAuthorizationMessages` export from `@lifewit/app-plugin-authorization-bridge/server` flattens each locale's string leaves into `namespace:key` entries and places application `overrides` under the owning plugin's namespace. Arrays and non-string values are excluded. This is the shared dictionary for pages, business actions, data scopes, fields and Collection titles; applications do not need separate translation maps for each caller.

```ts
import { createAuthorizationBridge } from '@lifewit/app-plugin-authorization-bridge/server';

createAuthorizationBridge({
  appId: 'inventory-management',
  appVersion: packageMetadata.version,
  pages: inventoryPermissionPages,
  localeNamespace: packageMetadata.name,
  locales: {
    'en-US': enUS,
    'zh-CN': zhCN,
  },
});
```

`localeNamespace` must match the namespace used by the app's `LocalizedText` descriptors. `createAuthorizationMessages(namespace, locales)` remains available when an app needs to build or test the dictionary separately. Pass either `locales` or `messages`, not both.

`collections` is read on each authenticated metadata request from the public `authz.database.collections.list()` registry after provider boot. Each entry contains only `{ name, title }`. Declare the title when registering the Collection, for example `{ key: 'warehouses.title', ns: 'inventory-app' }`; use the owning package's namespace explicitly for cross-application display. No business table rows or field permissions are exported here.

The receiving application validates this optional metadata field and merges titles by exact Collection name into the existing native options' `collections[].title`, for both permission-set options and default-access options. It must not add Collections absent from the native options, overwrite an existing native title, or change resource ids, actions or selections. Preserve the original `messages` dictionary and resolve titles against the viewer's language using `namespace:key`. Accept older bridges without `collections` and fall back to the original name when no title is available. The native child authorization endpoints remain unchanged; callers using them directly also read bridge metadata to obtain the display titles.
