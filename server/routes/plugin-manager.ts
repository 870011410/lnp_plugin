import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';
import { pluginManagerToken } from '../providers/plugin-manager/index.js';
import { PluginManagerError } from '../providers/plugin-manager/service.js';

const artifactSchema = z.object({
  filename: z.string(),
  size: z.number(),
  integrity: z.string(),
});
const runSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  name: z.string(),
  version: z.string(),
  action: z.enum(['pack', 'publish']),
  sourceRunId: z.string().optional(),
  registry: z.string().optional(),
  status: z.enum([
    'queued',
    'building',
    'packing',
    'publishing',
    'succeeded',
    'failed',
  ]),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  artifact: artifactSchema.optional(),
  reason: z.string().optional(),
});
const pluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  private: z.boolean(),
  capabilities: z.array(z.string()),
  canBuild: z.boolean(),
});
const overviewSchema = z.object({
  plugins: z.array(pluginSchema),
  registry: z.string(),
  downloadRegistry: z.string(),
  tokenConfigured: z.boolean(),
});
const runParams = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) });
const createInput = z.strictObject({
  pluginId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  action: z.enum(['pack', 'publish']),
  sourceRunId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const pluginManagerRoutes = defineApiRoutes<Application>((app) => {
  const root = new Hono();
  const secured = new Hono<AuthorizationEnv>();
  const routes = new Hono<AuthorizationEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const service = app.container.resolve(pluginManagerToken);
  const { manager } = service;
  secured.onError((error, context) =>
    apiErrorHandler(
      error instanceof PluginManagerError
        ? new ApiError({
            status: ['PLUGIN_NOT_FOUND', 'RUN_NOT_FOUND'].includes(error.reason)
              ? 'NOT_FOUND'
              : ['PLUGIN_BUSY', 'OPERATION_CONFLICT'].includes(error.reason)
                ? 'ABORTED'
                : error.reason === 'REGISTRY_UNAVAILABLE'
                  ? 'UNAVAILABLE'
                  : 'FAILED_PRECONDITION',
            reason: error.reason,
            domain: 'pluginManager',
            message: 'The plugin release operation could not be completed.',
          })
        : error,
      context,
    ),
  );
  for (const ownedPath of ['/pluginManager', '/pluginManager/*'])
    secured.use(
      ownedPath,
      auth.required(),
      authorization.middleware(),
      async (context, next) => {
        // Building local code and publishing a package are administration powers, never delegable page grants.
        if (!(await context.get('authz').snapshot()).unrestricted)
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'PLUGIN_MANAGER_FORBIDDEN',
            domain: 'pluginManager',
            message:
              'Plugin management requires unrestricted administrator access.',
          });
        await next();
      },
    );
  const declaration = (
    summary: string,
    operationId: string,
    schema: z.ZodType,
  ) =>
    describeRoute({
      tags: ['Plugin manager'],
      summary,
      operationId,
      responses: {
        200: dataResponse(schema),
        ...apiErrorResponses,
        400: apiErrorResponse(400),
        404: apiErrorResponse(404),
        409: apiErrorResponse(409),
        503: apiErrorResponse(503),
      },
    });
  routes.get(
    '/',
    declaration(
      'List local NocoBase 3 plugins and registry settings',
      'pluginManagerOverview',
      overviewSchema,
    ),
    async (context) =>
      context.json({
        data: {
          plugins: await manager.plugins(),
          registry: manager.config.registry,
          downloadRegistry: manager.config.downloadRegistry,
          tokenConfigured: Boolean(manager.config.token),
        },
      }),
  );
  routes.get(
    '/runs',
    describeRoute({
      tags: ['Plugin manager'],
      summary: 'Read plugin packaging and publication history',
      operationId: 'pluginManagerRuns',
      responses: { 200: listResponse(runSchema), ...apiErrorResponses },
    }),
    apiValidator('query', pagination),
    async (context) => {
      const { page, pageSize } = context.req.valid('query');
      const runs = await manager.runs();
      return context.json({
        data: runs.slice((page - 1) * pageSize, page * pageSize),
        meta: { page, pageSize, total: runs.length },
      });
    },
  );
  routes.post(
    '/runs',
    describeRoute({
      tags: ['Plugin manager'],
      summary: 'Queue a build/pack or publish an existing immutable artifact',
      operationId: 'pluginManagerCreateRun',
      description:
        'Requires an Idempotency-Key. Publishes only an existing verified artifact, never rebuilds on upload. A repeated operation key returns its original task.',
      responses: {
        202: dataResponse(runSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(400),
        404: apiErrorResponse(404),
        409: apiErrorResponse(409),
        503: apiErrorResponse(503),
      },
    }),
    apiValidator(
      'header',
      z.object({
        'idempotency-key': z.string().regex(/^\d{13}\.[0-9a-f-]{36}$/i),
      }),
    ),
    apiValidator('json', createInput),
    async (context) =>
      context.json(
        {
          data: await service.submit(
            context.req.valid('json'),
            context.req.valid('header')['idempotency-key'],
          ),
        },
        202,
      ),
  );
  routes.get(
    '/runs/:id',
    declaration('Read one plugin release task', 'pluginManagerRun', runSchema),
    apiValidator('param', runParams),
    async (context) =>
      context.json({ data: await manager.run(context.req.valid('param').id) }),
  );
  routes.get(
    '/runs/:id/artifact',
    describeRoute({
      tags: ['Plugin manager'],
      summary: 'Download a verified npm tarball',
      operationId: 'pluginManagerArtifact',
      responses: {
        200: {
          description: 'The npm package tarball.',
          content: {
            'application/gzip': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        ...apiErrorResponses,
        400: apiErrorResponse(400),
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', runParams),
    async (context) => {
      const { body, filename, size } = await manager.download(
        context.req.valid('param').id,
      );
      return new Response(body, {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Length': String(size),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'no-store',
        },
      });
    },
  );
  secured.route('/pluginManager', routes);
  root.route('/', secured);
  return root;
});
