import { AppCommand, CommandError } from '@nocobase/app-cli';
import { randomUUID } from 'node:crypto';

export default class ReleaseCommand extends AppCommand {
  protected async release(
    action: 'pack' | 'publish',
    target: string,
    dryRun: boolean,
  ) {
    const { PluginManager, PluginManagerError } =
      await import('../../../../server/providers/plugin-manager/service.js');
    return this.withApp(async ({ app }) => {
      const config =
        app.config.get<
          import('../../../../server/config/plugin-manager.js').PluginManagerConfig
        >('pluginManager');
      if (!config) throw new Error('Plugin manager configuration is missing.');
      const manager = new PluginManager(
        app.paths.root(),
        app.paths.storage('plugin-manager'),
        config,
      );
      try {
        const input =
          action === 'pack'
            ? { pluginId: target, action }
            : {
                pluginId: (await manager.run(target)).pluginId,
                action,
                sourceRunId: target,
              };
        const plugin = (await manager.plugins()).find(
          (item) => item.id === input.pluginId,
        );
        if (!plugin) throw new PluginManagerError('PLUGIN_NOT_FOUND');
        if (action === 'pack' && !plugin.canBuild)
          throw new PluginManagerError('BUILD_SCRIPT_REQUIRED');
        if (dryRun) {
          this.setStatus('success-noop');
          this.log(JSON.stringify({ ...input, registry: config.registry }));
          return { ...input, registry: config.registry };
        }
        const { run } = await manager.create(
          input,
          `${Date.now()}.${randomUUID()}`,
        );
        this.logToStderr(`${action}: ${run.name}@${run.version}`);
        await manager.execute(run.id);
        const completed = await manager.run(run.id);
        if (completed.status !== 'succeeded')
          throw new PluginManagerError(completed.reason ?? 'COMMAND_FAILED');
        this.log(`${action} succeeded: ${run.id}`);
        return completed;
      } catch (error) {
        if (error instanceof PluginManagerError)
          throw new CommandError(
            'The plugin release operation failed. Check the plugin manager documentation and release history.',
            { code: error.reason },
          );
        throw error;
      }
    });
  }
}
