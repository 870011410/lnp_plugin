import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import { describe, expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';

describe('plugin manager API security', () => {
  const test = createAppTest({
    createServer: async (options) => {
      if (!options.configPath)
        throw new Error('Isolated test configuration is required.');
      const root = path.join(path.dirname(options.configPath), 'source');
      const plugin = path.join(root, 'packages', 'fixture');
      await mkdir(plugin, { recursive: true });
      await writeFile(
        path.join(plugin, 'package.json'),
        JSON.stringify({
          name: '@lnp/app-plugin-fixture',
          version: '1.0.0',
          files: ['dist'],
          exports: { './server': './dist/server.js' },
          scripts: { build: 'node build.cjs' },
        }),
      );
      await writeFile(
        path.join(plugin, 'build.cjs'),
        "const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/server.js','export default {}');",
      );
      return createStandaloneServer({
        ...options,
        paths: {
          rootDir: root,
          serverDir: fileURLToPath(new URL('../../server', import.meta.url)),
          databaseDir: fileURLToPath(
            new URL('../../database', import.meta.url),
          ),
        },
      });
    },
    scope: 'test',
    config: {
      app: { publicOrigin: 'http://localhost' },
      spa: {
        indexPath: fileURLToPath(new URL('../../index.html', import.meta.url)),
      },
      auth: { secret: 'plugin-manager-tests-secret-at-least-32-characters' },
      pluginManager: { token: 'synthetic-private-token' },
    },
  });
  test('protects every endpoint before validating inputs and never returns the publishing token', async ({
    testApp,
    request,
  }) => {
    const endpoints = [
      '',
      '/runs',
      `/runs/${'0'.repeat(64)}`,
      `/runs/${'0'.repeat(64)}/artifact`,
    ];
    for (const endpoint of endpoints)
      expect((await request(`/pluginManager${endpoint}`)).status).toBe(401);
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const overview = await admin.fetch('/pluginManager');
    expect(overview.status).toBe(200);
    const body = await overview.json();
    expect(body.data.registry).toContain('/lnp_nocobase_plugin/');
    expect(body.data.tokenConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain('synthetic-private-token');
    const member = {
      username: 'pluginviewer',
      email: 'pluginviewer@example.invalid',
      password: 'Synthetic-viewer-943!',
    };
    const response = await admin.fetch('/users', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
      },
      body: JSON.stringify({
        ...member,
        name: 'Plugin viewer',
        roleScopes: {},
      }),
    });
    expect(response.status).toBe(201);
    const ordinary = await signIn(testApp, member);
    for (const endpoint of endpoints)
      expect((await ordinary.fetch(`/pluginManager${endpoint}`)).status).toBe(
        403,
      );
    const post = {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: '{}',
    };
    expect((await request('/pluginManager/runs', post)).status).toBe(401);
    expect((await ordinary.fetch('/pluginManager/runs', post)).status).toBe(
      403,
    );
    expect((await admin.fetch('/pluginManager/runs', post)).status).toBe(400);
    expect((await admin.fetch('/pluginManager/runs/not-an-id')).status).toBe(
      400,
    );
  });

  test('runs a submitted packaging job and serves the verified archive', async ({
    testApp,
  }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const operationKey = `${Date.now()}.${randomUUID()}`;
    const options = {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'Idempotency-Key': operationKey,
      },
      body: JSON.stringify({ pluginId: 'fixture', action: 'pack' }),
    };
    const response = await admin.fetch('/pluginManager/runs', options);
    expect(response.status).toBe(202);
    const { data: task } = await response.json();
    await expect
      .poll(
        async () =>
          (await (await admin.fetch(`/pluginManager/runs/${task.id}`)).json())
            .data.status,
        { timeout: 15_000 },
      )
      .toBe('succeeded');
    const replay = await admin.fetch('/pluginManager/runs', options);
    expect((await replay.json()).data.id).toBe(task.id);
    const history = await admin.fetch('/pluginManager/runs?page=1&pageSize=20');
    expect((await history.json()).meta.total).toBe(1);
    const archive = await admin.fetch(
      `/pluginManager/runs/${task.id}/artifact`,
    );
    expect(archive.status).toBe(200);
    expect(archive.headers.get('content-type')).toBe('application/gzip');
    expect(new Uint8Array(await archive.arrayBuffer()).slice(0, 2)).toEqual(
      new Uint8Array([0x1f, 0x8b]),
    );
  });
});
