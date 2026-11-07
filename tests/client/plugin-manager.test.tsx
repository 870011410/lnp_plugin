import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PluginManagerPage from '../../client/pages/settings/plugin-manager/index.js';
import type { PluginRun } from '../../client/pages/settings/plugin-manager/types.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

const plugin = {
  id: 'example',
  name: '@lnp/app-plugin-example',
  version: '1.0.0',
  capabilities: ['server'],
  private: false,
  canBuild: true,
  description: '',
};
const packed: PluginRun = {
  id: 'a'.repeat(64),
  pluginId: plugin.id,
  name: plugin.name,
  version: plugin.version,
  action: 'pack',
  status: 'succeeded',
  createdAt: '2026-11-07T00:00:00Z',
  artifact: {
    filename: 'example-1.0.0.tgz',
    size: 1024,
    integrity: 'sha512-example',
  },
};
let plugins = [plugin];
let runs: PluginRun[] = [];
let failure: Response | undefined;
let submitResponse: unknown;
const keys: (string | null)[] = [];
const api = vi.fn(({ method, path }: ApiCall) => {
  if (path === 'pluginManager' && method === 'GET')
    return (
      failure ?? {
        data: {
          plugins,
          registry: 'http://nexus.test/hosted/',
          downloadRegistry: 'http://nexus.test/group/',
          tokenConfigured: false,
        },
      }
    );
  if (path === 'pluginManager/runs' && method === 'GET')
    return { data: runs, meta: { total: runs.length } };
  if (path === 'pluginManager/runs' && method === 'POST')
    return submitResponse ?? { data: { ...packed, status: 'queued' } };
  return new Response(null, { status: 404 });
});
async function renderPage(locale = 'en-US') {
  const fetchApi = answerApi(api);
  return renderWithApp(
    <AuthenticationProvider>
      <PluginManagerPage />
    </AuthenticationProvider>,
    {
      route: '/settings/plugins',
      locale,
      namespace: 'plugin-test',
      namespaces: {
        'plugin-test': {
          'en-US': async () => ({ default: enUS }),
          'zh-CN': async () => ({ default: zhCN }),
        },
      },
      services: (app) => {
        app.container.instance(authenticationClientToken, {
          getSession: async () => ({ data: null }),
        });
      },
      fetch: async (request) => {
        if (request.method === 'POST')
          keys.push(request.headers.get('Idempotency-Key'));
        return fetchApi(request);
      },
    },
  );
}
beforeEach(() => {
  api.mockClear();
  keys.length = 0;
  plugins = [plugin];
  runs = [];
  failure = undefined;
  submitResponse = undefined;
});

describe('plugin manager page', () => {
  it.each(['en-US', 'zh-CN'])(
    'shows repositories and the empty state in %s',
    async (locale) => {
      plugins = [];
      await renderPage(locale);
      const copy = locale === 'zh-CN' ? zhCN.pluginManager : enUS.pluginManager;
      expect(await screen.findByText(copy.empty)).toBeVisible();
      expect(screen.getByText('http://nexus.test/hosted/')).toBeVisible();
      expect(screen.getByText(copy.noHistory)).toBeVisible();
    },
  );

  it('retries an uncertain build submission with the original operation key', async () => {
    submitResponse = Response.json(
      { error: { message: 'Unavailable', reason: 'REGISTRY_UNAVAILABLE' } },
      { status: 503 },
    );
    const view = await renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: `Actions for ${plugin.name}` }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: enUS.pluginManager.pack }),
    );
    await screen.findByRole('button', { name: enUS.pluginManager.retry });
    submitResponse = undefined;
    await userEvent.click(
      screen.getByRole('button', { name: enUS.pluginManager.retry }),
    );
    await waitFor(() =>
      expect(view.toasts()).toContainEqual(
        expect.objectContaining({ title: enUS.pluginManager.queued }),
      ),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^\d{13}\.[a-f0-9-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(api).toHaveBeenCalledWith({
      method: 'POST',
      path: 'pluginManager/runs',
      json: { pluginId: plugin.id, action: 'pack' },
    });
  });

  it('confirms publication of the selected immutable artifact', async () => {
    runs = [packed];
    await renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: enUS.pluginManager.publish }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(/http:\/\/nexus.test\/hosted\//),
    ).toBeVisible();
    expect(api.mock.calls.some(([call]) => call.method === 'POST')).toBe(false);
    await userEvent.click(
      within(dialog).getByRole('button', { name: enUS.pluginManager.publish }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith({
        method: 'POST',
        path: 'pluginManager/runs',
        json: {
          pluginId: plugin.id,
          action: 'publish',
          sourceRunId: packed.id,
        },
      }),
    );
  });

  it('allows packaging an already compiled plugin without a build script', async () => {
    plugins = [{ ...plugin, canBuild: false }];
    await renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: `Actions for ${plugin.name}` }),
    );
    const action = await screen.findByRole('menuitem');
    expect(action).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(action);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith({
        method: 'POST',
        path: 'pluginManager/runs',
        json: { pluginId: plugin.id, action: 'pack' },
      }),
    );
  });

  it('explains forbidden access without a retry', async () => {
    failure = Response.json(
      { error: { message: 'Forbidden' } },
      { status: 403 },
    );
    await renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      enUS.settings.denied,
    );
    expect(
      screen.queryByRole('button', { name: enUS.settings.retry }),
    ).not.toBeInTheDocument();
  });
});
