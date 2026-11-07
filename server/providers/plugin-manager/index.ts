import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import {
  Job,
  type JobExecutionContext,
  type JobExecutor,
} from '@nocobase/jobs';
import type { PluginManagerConfig } from '../../config/plugin-manager.js';
import { PluginManager, type RunInput, type PluginRun } from './service.js';

export interface PluginManagerService {
  readonly manager: PluginManager;
  submit(input: RunInput, key: string): Promise<PluginRun>;
}

export const pluginManagerToken =
  createServiceToken<PluginManagerService>('lnp/plugin-manager');

export default class PluginManagerProvider extends ServiceProvider<Application> {
  readonly name = 'app.plugin-manager';
  private executor?: JobExecutor;

  override register(): void {
    this.app.container.singleton(pluginManagerToken, () => {
      const config = this.app.config.get<PluginManagerConfig>('pluginManager');
      if (!config) throw new Error('Plugin manager configuration is missing.');
      const manager = new PluginManager(
        this.app.paths.root(),
        this.app.paths.storage('plugin-manager'),
        config,
      );
      return {
        manager,
        submit: async (input, key) => {
          const { run, created } = await manager.create(input, key);
          if (created) {
            const executor = this.executor;
            if (!executor) throw new Error('Plugin manager is not started.');
            try {
              await executor.addJob(new (releaseJob(manager))({ id: run.id }));
            } catch {
              await manager.execute(run.id, AbortSignal.abort());
              throw new Error('Release job could not be queued.');
            }
          }
          return run;
        },
      };
    });
  }

  override async start(): Promise<void> {
    const { manager } = this.app.container.resolve(pluginManagerToken);
    await manager.recover();
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getJobExecutor('lnp.plugin-manager');
    this.executor.registerJob(releaseJob(manager));
    await this.executor.setup();
  }

  override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
  }
}

const jobClasses = new WeakMap<
  PluginManager,
  ReturnType<typeof createReleaseJob>
>();
function releaseJob(manager: PluginManager) {
  let job = jobClasses.get(manager);
  if (!job) {
    job = createReleaseJob(manager);
    jobClasses.set(manager, job);
  }
  return job;
}
function createReleaseJob(manager: PluginManager) {
  return class PluginReleaseJob extends Job<{ id: string }> {
    static readonly jobName = 'lnp.plugin-release';
    async execute({ signal }: JobExecutionContext): Promise<void> {
      await manager.execute(this.payload.id, signal);
    }
  };
}
