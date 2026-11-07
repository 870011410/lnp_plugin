import { defineAppRoutes } from '@nocobase/app-client/plugins';
import { Package } from 'lucide-react';

export default defineAppRoutes([
  {
    parent: 'settingsSystem',
    name: 'pluginManager',
    path: '/plugins',
    auth: 'required',
    authz: 'unrestricted',
    navigation: {
      title: 'pluginManager.title',
      description: 'pluginManager.description',
      icon: Package,
    },
    breadcrumb: { title: 'pluginManager.title' },
    componentLoader: () => import('./index.js'),
  },
]);
