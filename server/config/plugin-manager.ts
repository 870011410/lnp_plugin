import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

export interface PluginManagerConfig {
  readonly registry: string;
  readonly downloadRegistry: string;
  readonly token?: string;
}

const pluginManager: AppConfigFactory<PluginManagerConfig> = defineAppConfig({
  defaults: {
    registry: 'http://192.168.20.172:8081/repository/lnp_nocobase_plugin/',
    downloadRegistry: 'http://192.168.20.172:8081/repository/lnp-plugin/',
  },
  env: {
    LNP_PLUGIN_REGISTRY: envString('registry'),
    LNP_PLUGIN_DOWNLOAD_REGISTRY: envString('downloadRegistry'),
    LNP_PLUGIN_NPM_TOKEN: envString('token', { secret: true }),
  },
});

export default pluginManager;
