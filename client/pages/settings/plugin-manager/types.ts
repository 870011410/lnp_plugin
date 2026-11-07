export interface LocalPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  private: boolean;
  capabilities: string[];
  canBuild: boolean;
}

export interface PluginRun {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  action: 'pack' | 'publish';
  status:
    'queued' | 'building' | 'packing' | 'publishing' | 'succeeded' | 'failed';
  createdAt: string;
  finishedAt?: string;
  artifact?: { filename: string; size: number; integrity: string };
  reason?: string;
}

export interface Overview {
  plugins: LocalPlugin[];
  registry: string;
  downloadRegistry: string;
  tokenConfigured: boolean;
}

export interface RunInput {
  pluginId: string;
  action: 'pack' | 'publish';
  sourceRunId?: string;
}
