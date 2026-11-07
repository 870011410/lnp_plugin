import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PluginManager,
  PluginManagerError,
  type RunProcess,
} from '../../server/providers/plugin-manager/service.js';

const directories: string[] = [];
const servers: Server[] = [];
const registry = 'http://127.0.0.1:9/registry/';
const key = () => `${Date.now()}.${randomUUID()}`;
async function fixture(extra: Record<string, unknown> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'lnp-plugin-test-'));
  directories.push(root);
  const plugin = path.join(root, 'packages', 'fixture');
  await mkdir(plugin, { recursive: true });
  await writeFile(
    path.join(plugin, 'package.json'),
    JSON.stringify({
      name: '@lnp/app-plugin-fixture',
      version: '0.1.0-beta.1',
      type: 'module',
      files: ['dist'],
      exports: { './server': './server.ts' },
      publishConfig: {
        exports: {
          './server': {
            types: './dist/server.d.ts',
            import: './dist/server.js',
          },
        },
      },
      scripts: { build: 'node build.mjs' },
      ...extra,
    }),
  );
  await writeFile(
    path.join(plugin, 'build.mjs'),
    `import {mkdirSync,writeFileSync} from 'node:fs';mkdirSync('dist',{recursive:true});writeFileSync('dist/server.js','export default {};');writeFileSync('dist/server.d.ts','declare const plugin: {}; export default plugin;');`,
  );
  const manager = new PluginManager(root, path.join(root, 'storage'), {
    registry,
    downloadRegistry: registry,
  });
  return { root, plugin, manager };
}

afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  for (const root of directories.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe('local plugin releases', () => {
  it('lists only real NocoBase 3 local plugin directories and rejects path traversal', async () => {
    const { root, plugin, manager } = await fixture();
    await symlink(plugin, path.join(root, 'packages', 'linked'));
    await mkdir(path.join(root, 'packages', 'ordinary'));
    await writeFile(
      path.join(root, 'packages', 'ordinary', 'package.json'),
      JSON.stringify({ name: 'ordinary', version: '1.0.0' }),
    );
    expect(await manager.plugins()).toMatchObject([
      { id: 'fixture', capabilities: ['server'], canBuild: true },
    ]);
    await expect(
      manager.create({ pluginId: '../fixture', action: 'pack' }, key()),
    ).rejects.toMatchObject({ reason: 'PLUGIN_NOT_FOUND' });
  });

  it('builds and packs with pnpm, preserves compiled exports and detects a changed archive', async () => {
    const { manager } = await fixture();
    const operation = key();
    const input = { pluginId: 'fixture', action: 'pack' as const };
    const [first, replay] = await Promise.all([
      manager.create(input, operation),
      manager.create(input, operation),
    ]);
    expect(replay).toMatchObject({ created: false, run: { id: first.run.id } });
    expect(await manager.create(input, operation)).toMatchObject({
      created: false,
      run: { id: first.run.id },
    });
    await expect(manager.create(input, key())).rejects.toMatchObject({
      reason: 'PLUGIN_BUSY',
    });
    await manager.execute(first.run.id);
    const result = await manager.run(first.run.id);
    expect(result.status).toBe('succeeded');
    expect(result.artifact?.integrity).toMatch(/^sha512-/);
    const { file } = await manager.artifact(result.id);
    expect((await manager.download(result.id)).filename).toBe(
      result.artifact?.filename,
    );
    await writeFile(file, 'changed');
    await expect(manager.artifact(result.id)).rejects.toMatchObject({
      reason: 'ARTIFACT_CHANGED',
    });
  }, 30_000);

  it('packs an already compiled JavaScript plugin without a build script', async () => {
    const { plugin, manager } = await fixture({
      scripts: { prepack: 'node -e "process.exit(1)"' },
      files: ['server'],
      exports: {
        './server': {
          types: './server/index.d.ts',
          import: './server/index.js',
        },
      },
      publishConfig: undefined,
    });
    await mkdir(path.join(plugin, 'server'));
    await writeFile(path.join(plugin, 'server/index.js'), 'export default {};');
    await writeFile(
      path.join(plugin, 'server/index.d.ts'),
      'declare const plugin: {}; export default plugin;',
    );
    expect(await manager.plugins()).toMatchObject([{ canBuild: false }]);
    const { run } = await manager.create(
      { pluginId: 'fixture', action: 'pack' },
      key(),
    );
    await manager.execute(run.id);
    expect(await manager.run(run.id)).toMatchObject({
      status: 'succeeded',
      artifact: { filename: expect.stringMatching(/\.tgz$/) },
    });
    expect((await manager.download(run.id)).size).toBeGreaterThan(0);
  }, 30_000);

  it('rejects an unbuilt package without a build script', async () => {
    const { manager } = await fixture({
      scripts: {},
      publishConfig: undefined,
    });
    const { run } = await manager.create(
      { pluginId: 'fixture', action: 'pack' },
      key(),
    );
    await manager.execute(run.id);
    expect(await manager.run(run.id)).toMatchObject({
      status: 'failed',
      reason: 'MISSING_BUILD_OUTPUT',
    });
  }, 30_000);

  it('publishes the same tarball using the real npm protocol with path-scoped credentials', async () => {
    const { root, manager: packing } = await fixture();
    const packed = await packing.create(
      { pluginId: 'fixture', action: 'pack' },
      key(),
    );
    await packing.execute(packed.run.id);
    expect(await packing.run(packed.run.id)).toMatchObject({
      status: 'succeeded',
    });
    const received: { url: string; auth?: string; body: string }[] = [];
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      received.push({
        url: req.url ?? '',
        auth: req.headers.authorization,
        body,
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.endsWith('/-/whoami'))
        res.end(JSON.stringify({ username: 'fixture' }));
      else if (req.method === 'PUT') {
        res.statusCode = 201;
        res.end('{"ok":true}');
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const target = `http://127.0.0.1:${(server.address() as AddressInfo).port}/registry/`;
    const manager = new PluginManager(root, path.join(root, 'storage'), {
      registry: target,
      downloadRegistry: target,
      token: 'synthetic-token',
    });
    const publish = await manager.create(
      { pluginId: 'fixture', action: 'publish', sourceRunId: packed.run.id },
      key(),
    );
    await manager.execute(publish.run.id);
    const completed = await manager.run(publish.run.id);
    expect(completed).toMatchObject({ status: 'succeeded', registry: target });
    const request = received.find((item) => item.body.includes('_attachments'));
    expect(request?.url).toMatch(/^\/registry\//);
    expect(request?.auth).toBe('Bearer synthetic-token');
    const published = JSON.parse(request!.body);
    expect(published['dist-tags']).toEqual({ beta: '0.1.0-beta.1' });
    const bytes = Buffer.from(
      Object.values<{ data: string }>(published._attachments)[0].data,
      'base64',
    );
    expect(bytes).toEqual(
      await readFile((await packing.artifact(packed.run.id)).file),
    );
    expect(JSON.stringify(await manager.runs())).not.toContain(
      'synthetic-token',
    );
    await expect(
      readFile(path.join(root, 'storage', 'runs', publish.run.id, '.npmrc')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  }, 30_000);

  it('rejects npm group targets before enqueueing a publication', async () => {
    const { root } = await fixture();
    const manager = new PluginManager(
      root,
      path.join(root, 'storage'),
      {
        registry: 'http://nexus.test/repository/group/',
        downloadRegistry: registry,
      },
      undefined,
      async () => Response.json({ format: 'npm', type: 'group' }),
    );
    await expect(manager.assertHosted()).rejects.toMatchObject({
      reason: 'REGISTRY_READ_ONLY',
    });
  });

  it('records a build failure without leaking command output and releases the plugin lock', async () => {
    const { root } = await fixture();
    const failed: RunProcess = async () => {
      throw new Error('build printed a private password');
    };
    const manager = new PluginManager(
      root,
      path.join(root, 'storage'),
      { registry, downloadRegistry: registry },
      failed,
    );
    const task = await manager.create(
      { pluginId: 'fixture', action: 'pack' },
      key(),
    );
    await manager.execute(task.run.id);
    expect(await manager.run(task.run.id)).toMatchObject({
      status: 'failed',
      reason: 'BUILD_FAILED',
    });
    expect(JSON.stringify(await manager.runs())).not.toContain(
      'private password',
    );
    expect(
      (await manager.create({ pluginId: 'fixture', action: 'pack' }, key()))
        .created,
    ).toBe(true);
    await manager.recover();
    expect((await manager.runs()).every((run) => run.status === 'failed')).toBe(
      true,
    );
    expect(PluginManagerError).toBeDefined();
  });

  it('refuses to publish a private packed manifest', async () => {
    const { manager } = await fixture({ private: true });
    const packed = await manager.create(
      { pluginId: 'fixture', action: 'pack' },
      key(),
    );
    await manager.execute(packed.run.id);
    const publish = await manager.create(
      { pluginId: 'fixture', action: 'publish', sourceRunId: packed.run.id },
      key(),
    );
    await manager.execute(publish.run.id);
    expect(await manager.run(publish.run.id)).toMatchObject({
      status: 'failed',
      reason: 'PRIVATE_PACKAGE',
    });
  }, 30_000);

  it('does not start a build when admission to the job executor fails', async () => {
    const { root } = await fixture();
    let called = false;
    const manager = new PluginManager(
      root,
      path.join(root, 'storage'),
      { registry, downloadRegistry: registry },
      async () => {
        called = true;
        return '';
      },
    );
    const task = await manager.create(
      { pluginId: 'fixture', action: 'pack' },
      key(),
    );
    await manager.execute(task.run.id, AbortSignal.abort());
    expect(called).toBe(false);
    expect(await manager.run(task.run.id)).toMatchObject({
      status: 'failed',
      reason: 'INTERRUPTED',
    });
  });

  it('rejects published runtime exports that still point to source files', async () => {
    const { manager } = await fixture({
      publishConfig: {
        exports: {
          './server': { types: './dist/server.d.ts', import: './server.ts' },
        },
      },
    });
    const task = await manager.create(
      { pluginId: 'fixture', action: 'pack' },
      key(),
    );
    await manager.execute(task.run.id);
    expect(await manager.run(task.run.id)).toMatchObject({
      status: 'failed',
      reason: 'MISSING_BUILD_OUTPUT',
    });
  }, 30_000);
});
