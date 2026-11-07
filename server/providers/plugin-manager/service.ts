import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { PluginManagerConfig } from '../../config/plugin-manager.js';

export class PluginManagerError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

export interface LocalPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly private: boolean;
  readonly capabilities: string[];
  readonly canBuild: boolean;
}

export interface PluginRun {
  readonly id: string;
  readonly pluginId: string;
  readonly name: string;
  readonly version: string;
  readonly action: 'pack' | 'publish';
  readonly sourceRunId?: string;
  readonly registry?: string;
  status:
    'queued' | 'building' | 'packing' | 'publishing' | 'succeeded' | 'failed';
  readonly createdAt: string;
  finishedAt?: string;
  artifact?: { filename: string; size: number; integrity: string };
  reason?: string;
}

export interface RunInput {
  readonly pluginId: string;
  readonly action: 'pack' | 'publish';
  readonly sourceRunId?: string;
}

interface Manifest {
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  exports?: Record<string, unknown>;
  scripts?: Record<string, string>;
  publishConfig?: { registry?: string };
}

export type RunProcess = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  },
) => Promise<string>;

/** Never forwards build/npm output: lifecycle output may contain credentials. */
export const runProcess: RunProcess = (command, args, options) =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new PluginManagerError('INTERRUPTED'));
      return;
    }
    const child = spawn(command, [...args], {
      ...options,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let output = '';
    const kill = () => {
      if (!child.pid) return;
      try {
        process.kill(
          process.platform === 'win32' ? child.pid : -child.pid,
          'SIGKILL',
        );
      } catch {
        /* Already exited. */
      }
    };
    const timer = setTimeout(kill, 10 * 60_000);
    options.signal?.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (output.length < 1_000_000) output += chunk.toString();
      else kill();
    });
    child.stderr.resume();
    child.once('error', () =>
      reject(new PluginManagerError('TOOL_UNAVAILABLE')),
    );
    child.once('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', kill);
      if (code === 0 && !options.signal?.aborted) resolve(output);
      else
        reject(
          new PluginManagerError(
            options.signal?.aborted ? 'INTERRUPTED' : 'COMMAND_FAILED',
          ),
        );
    });
  });

function validRegistry(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PluginManagerError('INVALID_REGISTRY');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new PluginManagerError('INVALID_REGISTRY');
  return `${url.href.replace(/\/+$/, '')}/`;
}

const active = new Set(['queued', 'building', 'packing', 'publishing']);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class PluginManager {
  private creation = Promise.resolve();
  constructor(
    readonly root: string,
    readonly storage: string,
    readonly config: PluginManagerConfig,
    private readonly process: RunProcess = runProcess,
    private readonly request: typeof fetch = fetch,
  ) {}

  private runDir(id: string): string {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new PluginManagerError('RUN_NOT_FOUND');
    return path.join(this.storage, 'runs', id);
  }

  private async pluginDirectory(id: string): Promise<string> {
    if (!identifier.test(id) || id === '.' || id === '..')
      throw new PluginManagerError('PLUGIN_NOT_FOUND');
    const parent = path.join(this.root, 'packages');
    const candidate = path.join(parent, id);
    try {
      if (
        (await realpath(candidate)) !== path.join(await realpath(parent), id) ||
        !(await stat(candidate)).isDirectory()
      )
        throw new Error('Not a local source directory');
    } catch {
      throw new PluginManagerError('PLUGIN_NOT_FOUND');
    }
    return candidate;
  }

  async plugins(): Promise<LocalPlugin[]> {
    let entries;
    try {
      entries = await readdir(path.join(this.root, 'packages'), {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const plugins: LocalPlugin[] = [];
    for (const entry of entries.slice(0, 200)) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      let manifest: Manifest;
      try {
        const directory = await this.pluginDirectory(entry.name);
        manifest = JSON.parse(
          await readFile(path.join(directory, 'package.json'), 'utf8'),
        ) as Manifest;
      } catch {
        continue;
      }
      if (
        typeof manifest.name !== 'string' ||
        !/^(?:@[a-z0-9._-]+\/)?app-plugin-[a-z0-9._-]+$/.test(manifest.name) ||
        typeof manifest.version !== 'string'
      )
        continue;
      const capabilities = ['client', 'server', 'cli'].filter(
        (key) => manifest.exports?.[`./${key}`],
      );
      // NocoBase 3 contributions use explicit package exports; legacy v2 manifests are not publishable here.
      if (!capabilities.length) continue;
      plugins.push({
        id: entry.name,
        name: manifest.name,
        version: manifest.version,
        description:
          typeof manifest.description === 'string' ? manifest.description : '',
        private: manifest.private === true,
        capabilities,
        canBuild: Boolean(manifest.scripts?.build),
      });
    }
    return plugins.sort((a, b) => a.name.localeCompare(b.name));
  }

  async runs(): Promise<PluginRun[]> {
    let entries: string[];
    try {
      entries = await readdir(path.join(this.storage, 'runs'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const runs: PluginRun[] = [];
    for (const id of entries) {
      try {
        runs.push(await this.run(id));
      } catch {
        /* A creation is still being committed. */
      }
    }
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async run(id: string): Promise<PluginRun> {
    try {
      return JSON.parse(
        await readFile(path.join(this.runDir(id), 'run.json'), 'utf8'),
      ) as PluginRun;
    } catch {
      throw new PluginManagerError('RUN_NOT_FOUND');
    }
  }

  private async save(run: PluginRun): Promise<void> {
    const directory = this.runDir(run.id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'run.tmp'), JSON.stringify(run), {
      mode: 0o600,
    });
    await rename(
      path.join(directory, 'run.tmp'),
      path.join(directory, 'run.json'),
    );
  }

  async create(
    input: RunInput,
    operationKey: string,
  ): Promise<{ run: PluginRun; created: boolean }> {
    // Serialize admission so simultaneous retries receive the original receipt.
    const result = this.creation.then(() =>
      this.createRun(input, operationKey),
    );
    this.creation = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private async createRun(
    input: RunInput,
    operationKey: string,
  ): Promise<{ run: PluginRun; created: boolean }> {
    if (!/^\d{13}\.[0-9a-f-]{36}$/i.test(operationKey))
      throw new PluginManagerError('INVALID_OPERATION_KEY');
    const id = createHash('sha256').update(operationKey).digest('hex');
    try {
      const previous = await this.run(id);
      if (
        previous.pluginId !== input.pluginId ||
        previous.action !== input.action ||
        previous.sourceRunId !== input.sourceRunId
      )
        throw new PluginManagerError('OPERATION_CONFLICT');
      return { run: previous, created: false };
    } catch (error) {
      if (
        !(error instanceof PluginManagerError) ||
        error.reason !== 'RUN_NOT_FOUND'
      )
        throw error;
    }
    const plugin = (await this.plugins()).find(
      (item) => item.id === input.pluginId,
    );
    if (!plugin) throw new PluginManagerError('PLUGIN_NOT_FOUND');
    let source: PluginRun | undefined;
    if (input.action === 'publish') {
      if (!input.sourceRunId) throw new PluginManagerError('ARTIFACT_REQUIRED');
      source = await this.run(input.sourceRunId);
      if (
        source.action !== 'pack' ||
        source.status !== 'succeeded' ||
        source.pluginId !== plugin.id ||
        !source.artifact
      )
        throw new PluginManagerError('ARTIFACT_REQUIRED');
      await this.assertHosted();
    } else if (!plugin.canBuild)
      throw new PluginManagerError('BUILD_SCRIPT_REQUIRED');
    const registry =
      input.action === 'publish'
        ? validRegistry(this.config.registry)
        : undefined;
    const lock = path.join(this.storage, 'locks', plugin.id);
    await mkdir(path.dirname(lock), { recursive: true });
    try {
      await mkdir(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new PluginManagerError('PLUGIN_BUSY');
      throw error;
    }
    const run: PluginRun = {
      id,
      ...input,
      name: source?.name ?? plugin.name,
      version: source?.version ?? plugin.version,
      status: 'queued',
      createdAt: new Date().toISOString(),
      ...(registry ? { registry } : {}),
    };
    try {
      await this.save(run);
    } catch (error) {
      await rm(lock, { recursive: true });
      throw error;
    }
    return { run, created: true };
  }

  /** Nexus repository metadata is read-only. Never auto-select a different repository. */
  async assertHosted(): Promise<void> {
    const registry = new URL(validRegistry(this.config.registry));
    const match = /^(.*)\/repository\/([^/]+)\/$/.exec(registry.pathname);
    if (!match) return;
    let response: Response;
    try {
      response = await this.request(
        new URL(
          `${match[1]}/service/rest/v1/repositories/${match[2]}`,
          registry.origin,
        ),
        { signal: AbortSignal.timeout(8000), redirect: 'error' },
      );
    } catch {
      throw new PluginManagerError('REGISTRY_UNAVAILABLE');
    }
    if ([401, 403].includes(response.status)) return; // The publish protocol remains authoritative if metadata is private.
    if (!response.ok) throw new PluginManagerError('REGISTRY_UNAVAILABLE');
    const info = (await response.json()) as { format?: string; type?: string };
    if (info.format !== 'npm' || info.type !== 'hosted')
      throw new PluginManagerError('REGISTRY_READ_ONLY');
  }

  async artifact(id: string): Promise<{ run: PluginRun; file: string }> {
    const run = await this.run(id);
    if (run.action !== 'pack' || run.status !== 'succeeded' || !run.artifact)
      throw new PluginManagerError('ARTIFACT_REQUIRED');
    const filename = path.basename(run.artifact.filename);
    const file = path.join(this.runDir(id), filename);
    const digest = createHash('sha512');
    for await (const chunk of createReadStream(file))
      digest.update(chunk as Buffer);
    if (`sha512-${digest.digest('base64')}` !== run.artifact.integrity)
      throw new PluginManagerError('ARTIFACT_CHANGED');
    return { run, file };
  }

  /** Interrupted npm publication is never retried automatically: its remote outcome may be unknown. */
  async recover(): Promise<void> {
    for (const run of await this.runs()) {
      await rm(path.join(this.runDir(run.id), '.npmrc'), { force: true });
      if (active.has(run.status)) {
        run.status = 'failed';
        run.reason = 'INTERRUPTED';
        run.finishedAt = new Date().toISOString();
        await this.save(run);
      }
    }
    await rm(path.join(this.storage, 'locks'), {
      recursive: true,
      force: true,
    });
  }

  async execute(id: string, signal?: AbortSignal): Promise<void> {
    const run = await this.run(id);
    if (run.status !== 'queued') return;
    try {
      if (signal?.aborted) throw new PluginManagerError('INTERRUPTED');
      if (run.action === 'pack') await this.pack(run, signal);
      else await this.publish(run, signal);
      run.status = 'succeeded';
    } catch (error) {
      run.status = 'failed';
      run.reason =
        error instanceof PluginManagerError ? error.reason : 'COMMAND_FAILED';
    } finally {
      run.finishedAt = new Date().toISOString();
      await this.save(run);
      await rm(path.join(this.storage, 'locks', run.pluginId), {
        recursive: true,
        force: true,
      });
    }
  }

  private async pack(run: PluginRun, signal?: AbortSignal): Promise<void> {
    const cwd = await this.pluginDirectory(run.pluginId);
    const plugin = (await this.plugins()).find(
      (item) => item.id === run.pluginId,
    );
    if (!plugin || plugin.name !== run.name || plugin.version !== run.version)
      throw new PluginManagerError('SOURCE_CHANGED');
    run.status = 'building';
    await this.save(run);
    try {
      await this.process('pnpm', ['run', 'build'], { cwd, signal });
    } catch {
      throw new PluginManagerError(
        signal?.aborted ? 'INTERRUPTED' : 'BUILD_FAILED',
      );
    }
    run.status = 'packing';
    await this.save(run);
    await this.process(
      'pnpm',
      ['pack', '--pack-destination', this.runDir(run.id), '--json'],
      {
        cwd,
        signal,
        env: { ...process.env, npm_config_ignore_scripts: 'true' },
      },
    );
    const files = (await readdir(this.runDir(run.id))).filter((file) =>
      file.endsWith('.tgz'),
    );
    if (files.length !== 1) throw new PluginManagerError('INVALID_ARTIFACT');
    const file = path.join(this.runDir(run.id), files[0]);
    const manifest = await this.inspectArchive(file);
    if (manifest.name !== run.name || manifest.version !== run.version)
      throw new PluginManagerError('SOURCE_CHANGED');
    const digest = createHash('sha512');
    for await (const chunk of createReadStream(file))
      digest.update(chunk as Buffer);
    run.artifact = {
      filename: files[0],
      size: (await stat(file)).size,
      integrity: `sha512-${digest.digest('base64')}`,
    };
  }

  private async inspectArchive(file: string): Promise<Manifest> {
    const { t } = await import('tar');
    if ((await stat(file)).size > 100 * 1024 * 1024)
      throw new PluginManagerError('ARTIFACT_TOO_LARGE');
    let manifest = '';
    const files = new Set<string>();
    let invalid = false;
    await t({
      file,
      onReadEntry(entry) {
        files.add(entry.path);
        if (
          entry.type === 'SymbolicLink' ||
          entry.type === 'Link' ||
          entry.path.includes('..') ||
          /(?:^|\/)(?:\.env[^/]*|config\.yml|\.npmrc|node_modules)(?:\/|$)/.test(
            entry.path,
          )
        )
          invalid = true;
        if (entry.path === 'package/package.json')
          entry.on('data', (data: Buffer) => {
            if (manifest.length < 256_000) manifest += data.toString();
            else invalid = true;
          });
      },
    });
    if (invalid) throw new PluginManagerError('INVALID_ARTIFACT');
    let metadata: Manifest;
    try {
      metadata = JSON.parse(manifest) as Manifest;
    } catch {
      throw new PluginManagerError('INVALID_ARTIFACT');
    }
    const targets = (value: unknown): string[] =>
      typeof value === 'string'
        ? [value]
        : value && typeof value === 'object'
          ? Object.values(value).flatMap(targets)
          : [];
    const exports = targets(metadata.exports);
    const runtime = ['client', 'server', 'cli'].flatMap((key) =>
      targets(metadata.exports?.[`./${key}`]),
    );
    if (
      !runtime.length ||
      runtime.some((target) => !target.startsWith('./dist/')) ||
      exports.some(
        (target) =>
          !target.startsWith('./') ||
          ![...files].some((file) =>
            path.matchesGlob(file, `package/${target.slice(2)}`),
          ),
      )
    )
      throw new PluginManagerError('MISSING_BUILD_OUTPUT');
    return metadata;
  }

  private async publish(run: PluginRun, signal?: AbortSignal): Promise<void> {
    const { file } = await this.artifact(run.sourceRunId ?? '');
    const manifest = await this.inspectArchive(file);
    if (manifest.private) throw new PluginManagerError('PRIVATE_PACKAGE');
    await this.assertHosted();
    const registry = validRegistry(run.registry ?? this.config.registry);
    if (
      manifest.publishConfig?.registry &&
      validRegistry(manifest.publishConfig.registry) !== registry
    )
      throw new PluginManagerError('REGISTRY_MISMATCH');
    const cwd = this.runDir(run.id);
    const env = { ...process.env };
    const npmrc = path.join(cwd, '.npmrc');
    // Credentials are restricted to the exact registry path and never appear on the command line or in task JSON.
    if (this.config.token) {
      const url = new URL(registry);
      if (/[\r\n]/.test(this.config.token))
        throw new PluginManagerError('AUTHENTICATION_FAILED');
      await writeFile(
        npmrc,
        `registry=${registry}\n//${url.host}${url.pathname}:_authToken=${this.config.token}\n`,
        { mode: 0o600 },
      );
      env.NPM_CONFIG_USERCONFIG = npmrc;
    }
    try {
      try {
        await this.process(
          'npm',
          [
            'whoami',
            '--registry',
            registry,
            '--fetch-retries=0',
            '--fetch-timeout=15000',
          ],
          { cwd, env, signal },
        );
      } catch {
        throw new PluginManagerError('AUTHENTICATION_FAILED');
      }
      run.status = 'publishing';
      await this.save(run);
      const tag = run.version.includes('-') ? 'beta' : 'latest';
      try {
        await this.process(
          'npm',
          [
            'publish',
            file,
            '--registry',
            registry,
            '--tag',
            tag,
            '--ignore-scripts',
            '--fetch-retries=0',
            '--fetch-timeout=60000',
          ],
          { cwd, env, signal },
        );
      } catch {
        throw new PluginManagerError(
          signal?.aborted ? 'INTERRUPTED' : 'PUBLISH_FAILED',
        );
      }
    } finally {
      await rm(npmrc, { force: true });
    }
  }

  async download(
    id: string,
  ): Promise<{ body: ReadableStream; filename: string; size: number }> {
    const { run, file } = await this.artifact(id);
    return {
      body: Readable.toWeb(createReadStream(file)) as ReadableStream,
      filename: run.artifact!.filename,
      size: run.artifact!.size,
    };
  }
}
