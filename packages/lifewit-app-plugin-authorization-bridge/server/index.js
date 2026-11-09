import path from 'node:path';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { defineServerPlugin } from '@nocobase/app-server/plugins';
import {
  apiErrorHandler,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

const text = z.union([
  z.string().min(1),
  z.object({
    key: z.string().min(1),
    ns: z.string().optional(),
    defaultValue: z.string().optional(),
  }),
]);
const schema = z.object({
  appId: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  protocolVersion: z.literal('1'),
  appVersion: z.string(),
  pages: z.array(
    z.object({
      id: z.string().min(1),
      title: text,
      parentId: z.string().optional(),
    }),
  ),
  capabilities: z.object({
    permissionSets: z.literal(true),
    subjects: z.array(z.string()),
    pages: z.literal(true),
  }),
  messages: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  collections: z.array(z.object({ name: z.string(), title: text })).optional(),
});

/** Flatten public application copy and plugin overrides into the bridge's namespace:key dictionary. */
export function createAuthorizationMessages(namespace, locales) {
  if (typeof namespace !== 'string' || !namespace.trim())
    throw new TypeError('A locale namespace is required');
  return Object.fromEntries(
    Object.entries(locales).map(([locale, resource]) => {
      const messages = {};
      const visit = (values, ns, prefix = '') => {
        for (const [key, value] of Object.entries(values)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (typeof value === 'string') messages[`${ns}:${path}`] = value;
          else if (value && typeof value === 'object' && !Array.isArray(value))
            visit(value, ns, path);
        }
      };
      const { overrides, ...application } = resource;
      visit(application, namespace);
      if (
        overrides &&
        typeof overrides === 'object' &&
        !Array.isArray(overrides)
      )
        for (const [ns, values] of Object.entries(overrides)) {
          if (values && typeof values === 'object' && !Array.isArray(values))
            visit(values, ns);
        }
      return [locale, messages];
    }),
  );
}

/** Exposes metadata only. The native Authorization plugin owns persistence and enforcement. */
export function createAuthorizationBridge(options) {
  const {
    localeNamespace,
    locales,
    messages: suppliedMessages,
    ...bridgeOptions
  } = options;
  if (locales !== undefined && suppliedMessages !== undefined)
    throw new TypeError('Pass either locales or messages, not both');
  if (locales !== undefined && !localeNamespace?.trim())
    throw new TypeError(
      'localeNamespace is required when locales are provided',
    );
  if (locales === undefined && localeNamespace !== undefined)
    throw new TypeError(
      'locales are required when localeNamespace is provided',
    );
  const messages =
    locales === undefined
      ? suppliedMessages
      : createAuthorizationMessages(localeNamespace, locales);
  const metadata = schema.parse({
    ...bridgeOptions,
    ...(messages === undefined ? {} : { messages }),
    protocolVersion: '1',
    capabilities: { permissionSets: true, subjects: ['user'], pages: true },
  });
  if (
    new Set(metadata.pages.map((page) => page.id)).size !==
    metadata.pages.length
  )
    throw new TypeError('Duplicate page permission id');
  const routes = [
    defineApiRoutes((app) => {
      const router = new Hono();
      const bridge = new Hono();
      const auth = app.container.resolve(authenticationToken);
      const authz = app.container.resolve(authorizationToken);
      bridge.onError(apiErrorHandler);
      bridge.use('*', auth.required({ scopedKeys: true }), authz.middleware());
      bridge.get(
        '/metadata',
        async (c, next) => {
          await c.get('authz').require({
            resource: {
              type: 'settings',
              id: 'authorization.permission-sets',
            },
            action: 'read',
          });
          await next();
        },
        describeRoute({
          tags: ['Authorization bridge'],
          operationId: 'getAuthorizationBridgeMetadata',
          summary: 'Read child application permission metadata',
          responses: { 200: dataResponse(schema), ...apiErrorResponses },
        }),
        apiValidator('query', z.strictObject({})),
        (c) =>
          c.json(
            {
              data: {
                ...metadata,
                // Read the public registry after provider boot, never a private table or a UI-only mapping.
                collections: authz.database.collections
                  .list()
                  .map(({ name, title }) => ({ name, title })),
              },
            },
            200,
            {
              'cache-control': 'no-store',
            },
          ),
      );
      router.route('/authorizationBridge', bridge);
      return router;
    }),
  ];
  return defineServerPlugin({
    packageName: '@lifewit/app-plugin-authorization-bridge',
    baseDir: path.resolve(import.meta.dirname, '..'),
    routes,
  });
}
