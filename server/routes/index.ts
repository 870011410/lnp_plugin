import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { pluginManagerRoutes } from './plugin-manager.js';

const routes: readonly AppRouteContribution<Application>[] = [
  pluginManagerRoutes,
];

export default routes;
