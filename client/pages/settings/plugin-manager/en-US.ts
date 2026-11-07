const pluginManager = {
  title: 'Plugin management',
  description: 'Build, package and publish your NocoBase 3 plugins.',
  repository: 'Package repositories',
  repositoryDescription:
    'Publish to the hosted repository; install from the group repository.',
  publishTarget: 'Publish repository',
  downloadTarget: 'Download repository',
  tokenConfigured: 'A publishing token is configured on the server.',
  npmCredentials:
    'Publishing uses the server user’s npm login. If authentication fails, sign in to this hosted repository on the server.',
  localPlugins: 'Local plugins',
  sourceHint:
    'Plugins in this application’s packages directory. Source plugins are built before packing; precompiled JavaScript plugins are packed directly. Private packages must be made publishable before upload.',
  empty:
    'No local NocoBase 3 plugins yet. Add a plugin to packages, then refresh.',
  plugin: 'Plugin',
  version: 'Version',
  capabilities: 'Capabilities',
  publication: 'Publication',
  private: 'Private',
  publishable: 'Publishable',
  actionsFor: 'Actions for {{name}}',
  downloadFor: 'Download {{name}}',
  capability: { client: 'Client', server: 'Server', cli: 'CLI' },
  pack: 'Build and pack',
  packOnly: 'Pack',
  publish: 'Publish',
  refresh: 'Refresh',
  retry: 'Retry original request',
  queued: 'Release task queued',
  history: 'Release history',
  historyDescription:
    'Download a successful package or publish the exact artifact. Interrupted releases are never published again automatically.',
  noHistory: 'No packaging or publication tasks yet.',
  createdAt: 'Created',
  operation: 'Operation',
  statusLabel: 'Status',
  publishConfirm: 'Publish this plugin?',
  publishDescription:
    'Publish {{name}}@{{version}} to {{registry}}. Existing package versions cannot be replaced; change the version and pack again for a new release.',
  status: {
    queued: 'Queued',
    building: 'Building',
    packing: 'Packing',
    publishing: 'Publishing',
    succeeded: 'Succeeded',
    failed: 'Failed',
  },
  errors: {
    COMMAND_FAILED:
      'The operation failed. Check the plugin’s build and package configuration, then retry.',
    TOOL_UNAVAILABLE:
      'Node.js, pnpm or npm is unavailable on the application server.',
    INVALID_REGISTRY:
      'Set a valid npm registry URL without embedded credentials.',
    PLUGIN_NOT_FOUND: 'The local plugin no longer exists. Refresh the list.',
    RUN_NOT_FOUND: 'The release task could not be found.',
    ARTIFACT_REQUIRED:
      'Build and pack the plugin successfully before publishing.',
    BUILD_SCRIPT_REQUIRED:
      'The plugin must declare a build script in package.json.',
    PLUGIN_BUSY:
      'A task for this plugin is already in progress. Wait for it to finish.',
    OPERATION_CONFLICT:
      'This request key already belongs to another operation. Check the release history.',
    INVALID_OPERATION_KEY:
      'The operation key is invalid. Reload the page and retry.',
    REGISTRY_UNAVAILABLE:
      'The package repository is unavailable. Check its URL and network connection.',
    REGISTRY_READ_ONLY:
      'This is a group or proxy repository. Select an npm hosted repository for publication.',
    ARTIFACT_CHANGED:
      'The archive has changed since it was packed. Build a new package.',
    INTERRUPTED:
      'The server stopped during this task. Check the repository before retrying a publication.',
    SOURCE_CHANGED:
      'The plugin name or version changed during packaging. Build a new package.',
    BUILD_FAILED:
      'The plugin build failed. Run its build script in the terminal to see the compiler output.',
    INVALID_ARTIFACT:
      'The archive is invalid or contains credentials, links or unsupported package files.',
    ARTIFACT_TOO_LARGE: 'The package exceeds the 100 MB upload limit.',
    MISSING_BUILD_OUTPUT:
      'The archive must contain every exported file, with JavaScript runtime entries. Build TypeScript sources first and check files and publishConfig.exports.',
    PRIVATE_PACKAGE:
      'The packed manifest is private. Set private to false, then build a new package before publishing.',
    AUTHENTICATION_FAILED:
      'Repository authentication failed. Configure a publishing token or run npm login on the server.',
    PUBLISH_FAILED:
      'Publication was not confirmed. Check registry permissions and whether this version already exists before retrying.',
    REGISTRY_MISMATCH:
      'The package’s publishConfig.registry differs from the configured hosted repository.',
  },
};
export default pluginManager;
