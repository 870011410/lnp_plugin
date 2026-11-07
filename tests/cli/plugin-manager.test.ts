import { bindAppCommand, runAppCommand } from '@nocobase/app-testing/cli';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import PackPlugin from '../../cli/commands/plugins/pack.js';
import ListPlugins from '../../cli/commands/plugins/list.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lnp-plugin-cli-'));
  roots.push(root);
  await mkdir(path.join(root, 'packages', 'example'), { recursive: true });
  await writeFile(
    path.join(root, 'packages', 'example', 'package.json'),
    JSON.stringify({
      name: '@lnp/app-plugin-example',
      version: '1.0.0',
      exports: { './server': './server.ts' },
      scripts: { build: 'node build.mjs' },
    }),
  );
  const options = {
    rootDir: root,
    loadRuntime: async () =>
      ({ env: {}, scope: { destroy: async () => {} } }) as never,
    createApp: () =>
      ({
        config: {
          get: () => ({
            registry: 'http://127.0.0.1:9/hosted/',
            downloadRegistry: 'http://127.0.0.1:9/group/',
          }),
        },
        paths: {
          root: () => root,
          storage: (file: string) => path.join(root, 'storage', file),
        },
        shutdown: async () => {},
      }) as never,
  };
  return { root, options };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe('plugin manager commands', () => {
  it('returns plugin metadata as one JSON document', async () => {
    const { options } = await fixture();
    const result = await runAppCommand(
      bindAppCommand(ListPlugins, { ...options, id: 'app:plugins:list' }),
      ['--json'],
    );
    expect(result.json()).toMatchObject({
      ok: true,
      result: { plugins: [{ id: 'example', name: '@lnp/app-plugin-example' }] },
    });
  });
  it('previews without executing a build or creating release storage', async () => {
    const { root, options } = await fixture();
    const result = await runAppCommand(
      bindAppCommand(PackPlugin, { ...options, id: 'app:plugins:pack' }),
      ['example', '--dry-run', '--json'],
    );
    expect(result.json()).toMatchObject({
      ok: true,
      status: 'success-noop',
      result: { action: 'pack', pluginId: 'example' },
    });
    expect(await readdir(root)).toEqual(['packages']);
  });
  it('reports missing plugin sources as a stable nonzero failure', async () => {
    const { options } = await fixture();
    const result = await runAppCommand(
      bindAppCommand(PackPlugin, { ...options, id: 'app:plugins:pack' }),
      ['../outside', '--dry-run', '--json'],
    );
    expect(result.exitCode).toBe(1);
    expect(result.json()).toMatchObject({
      ok: false,
      error: { code: 'PLUGIN_NOT_FOUND' },
    });
  });

  it('previews packaging a precompiled plugin without a build script', async () => {
    const { root, options } = await fixture();
    await writeFile(
      path.join(root, 'packages/example/package.json'),
      JSON.stringify({
        name: '@lnp/app-plugin-example',
        version: '1.0.0',
        exports: { './server': './server/index.js' },
      }),
    );
    const result = await runAppCommand(
      bindAppCommand(PackPlugin, { ...options, id: 'app:plugins:pack' }),
      ['example', '--dry-run', '--json'],
    );
    expect(result.json()).toMatchObject({
      ok: true,
      status: 'success-noop',
      result: { action: 'pack' },
    });
  });
});
