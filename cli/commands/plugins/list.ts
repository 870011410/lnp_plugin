import { AppCommand } from '@nocobase/app-cli';

export default class ListPlugins extends AppCommand {
  static override summary = 'List local NocoBase 3 plugin sources.';
  async run() {
    const { PluginManager } =
      await import('../../../server/providers/plugin-manager/service.js');
    return this.withApp(async ({ app }) => {
      const config =
        app.config.get<
          import('../../../server/config/plugin-manager.js').PluginManagerConfig
        >('pluginManager');
      if (!config) throw new Error('Plugin manager configuration is missing.');
      const plugins = await new PluginManager(
        app.paths.root(),
        app.paths.storage('plugin-manager'),
        config,
      ).plugins();
      for (const plugin of plugins)
        this.log(`${plugin.name}@${plugin.version} (${plugin.id})`);
      return { plugins };
    });
  }
}
