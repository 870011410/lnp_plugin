import {
  ApiClientError,
  resolveAppUrl,
  useApiClient,
  useSubmission,
  useToaster,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { Download, MoreHorizontal, Package, RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { DataTable } from '#components/data-table';
import { Loading } from '#components/loading';
import { PendingButton } from '#components/pending-button';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { useListData } from '../../../hooks/use-list-data.js';
import { ConfirmAction, SettingsError } from '../shared.js';
import { SettingsModulePage } from '../settings-module-page.js';
import type { LocalPlugin, Overview, PluginRun, RunInput } from './types.js';

const running = new Set(['queued', 'building', 'packing', 'publishing']);

export default function PluginManagerPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();
  const { session } = useAuthentication();
  const submission = useSubmission({
    scope: `${session?.user.id}:plugin-manager`,
  });
  const overview = useListData<{ data: Overview }>('pluginManager');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const history = useListData<{ data: PluginRun[]; meta: { total: number } }>(
    `pluginManager/runs?page=${pagination.pageIndex + 1}&pageSize=${pagination.pageSize}`,
  );
  const [selected, setSelected] = useState<PluginRun>();
  const [confirm, setConfirm] = useState(false);
  const [operation, setOperation] = useState<{
    input: RunInput;
    error?: unknown;
  }>();
  const refreshRuns = history.reload;
  const active = history.data?.data.some((run) => running.has(run.status));
  useEffect(() => {
    if (!active || history.error) return;
    // Task state changes while the build runs; only the visible active history is refreshed.
    const timer = setTimeout(refreshRuns, 2000);
    return () => clearTimeout(timer);
  }, [active, history.data, history.error, refreshRuns]);

  const start = async (input: RunInput) => {
    setOperation({ input });
    try {
      const response = await submission.run(input, (key, signal, snapshot) =>
        api.request<{ data: PluginRun }>({
          path: 'pluginManager/runs',
          method: 'POST',
          json: snapshot,
          headers: { 'Idempotency-Key': key },
          signal,
        }),
      );
      if (!response) return;
      setOperation(undefined);
      setConfirm(false);
      toaster.show({ type: 'success', title: t('pluginManager.queued') });
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      history.reload();
    } catch (error) {
      setOperation({ input, error });
    }
  };
  const errorText = (reason?: string) =>
    t(`pluginManager.errors.${reason ?? 'COMMAND_FAILED'}`, {
      defaultValue: t('pluginManager.errors.COMMAND_FAILED'),
    });
  const busy = submission.submitting;
  const runs = history.data?.data ?? [];
  const pluginColumns: ColumnDef<LocalPlugin>[] = [
    {
      accessorKey: 'name',
      header: t('pluginManager.plugin'),
      cell: ({ row }) => (
        <div className='flex min-w-48 flex-col gap-1'>
          <span className='font-medium'>{row.original.name}</span>
          <span className='text-sm text-muted-foreground'>
            {row.original.description || row.original.id}
          </span>
        </div>
      ),
    },
    { accessorKey: 'version', header: t('pluginManager.version') },
    {
      accessorKey: 'capabilities',
      header: t('pluginManager.capabilities'),
      cell: ({ row }) => (
        <div className='flex gap-1'>
          {row.original.capabilities.map((value) => (
            <StatusBadge size='sm' key={value}>
              {t(`pluginManager.capability.${value}`)}
            </StatusBadge>
          ))}
        </div>
      ),
    },
    {
      id: 'visibility',
      header: t('pluginManager.publication'),
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {t(
            row.original.private
              ? 'pluginManager.private'
              : 'pluginManager.publishable',
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const item = row.original;
        const unavailable =
          busy ||
          runs.some(
            (run) => run.pluginId === item.id && running.has(run.status),
          );
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={t('pluginManager.actionsFor', {
                    name: item.name,
                  })}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={unavailable || !item.canBuild}
                  onClick={() => {
                    void start({ pluginId: item.id, action: 'pack' });
                  }}
                >
                  <Package />
                  {t('pluginManager.pack')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
  const runColumns: ColumnDef<PluginRun>[] = [
    {
      accessorKey: 'createdAt',
      header: t('pluginManager.createdAt'),
      cell: ({ row }) =>
        new Intl.DateTimeFormat(locale, {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(row.original.createdAt)),
    },
    {
      id: 'package',
      header: t('pluginManager.plugin'),
      cell: ({ row }) => (
        <div className='min-w-48'>
          <div className='font-medium'>{row.original.name}</div>
          <div className='text-muted-foreground'>{row.original.version}</div>
        </div>
      ),
    },
    {
      accessorKey: 'action',
      header: t('pluginManager.operation'),
      cell: ({ row }) => t(`pluginManager.${row.original.action}`),
    },
    {
      accessorKey: 'status',
      header: t('pluginManager.statusLabel'),
      cell: ({ row }) => (
        <div className='flex max-w-sm flex-col gap-2'>
          <StatusBadge
            size='sm'
            tone={
              row.original.status === 'succeeded'
                ? 'success'
                : row.original.status === 'failed'
                  ? 'warning'
                  : 'info'
            }
          >
            {t(`pluginManager.status.${row.original.status}`)}
          </StatusBadge>
          {row.original.reason && (
            <span className='text-xs text-muted-foreground'>
              {errorText(row.original.reason)}
            </span>
          )}
          {row.original.artifact && (
            <span className='text-xs text-muted-foreground'>
              {row.original.artifact.filename} ·{' '}
              {new Intl.NumberFormat(locale, {
                maximumFractionDigits: 1,
              }).format(row.original.artifact.size / 1024)}{' '}
              KB
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const run = row.original;
        if (
          run.action !== 'pack' ||
          run.status !== 'succeeded' ||
          !run.artifact
        )
          return null;
        return (
          <div className='flex items-center gap-1'>
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('pluginManager.downloadFor', { name: run.name })}
              nativeButton={false}
              render={
                <a
                  href={resolveAppUrl(
                    `/api/pluginManager/runs/${run.id}/artifact`,
                  )}
                  download
                />
              }
            >
              <Download />
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={
                busy ||
                runs.some(
                  (item) =>
                    item.pluginId === run.pluginId && running.has(item.status),
                )
              }
              onClick={() => {
                setSelected(run);
                setConfirm(true);
              }}
            >
              {t('pluginManager.publish')}
            </Button>
          </div>
        );
      },
    },
  ];
  const overviewError = overview.error || history.error;
  return (
    <SettingsModulePage
      title={t('pluginManager.title')}
      description={t('pluginManager.description')}
      actions={
        <PendingButton
          busy={overview.loading || history.loading}
          variant='outline'
          onClick={() => {
            overview.reload();
            history.reload();
          }}
        >
          <RefreshCw data-icon='inline-start' />
          {t('pluginManager.refresh')}
        </PendingButton>
      }
    >
      <div className='flex flex-col gap-6'>
        <SettingsError
          error={overviewError}
          retry={() => {
            overview.reload();
            history.reload();
          }}
        />
        {operation?.error ? (
          <Alert variant='destructive'>
            <AlertDescription>
              <span>
                {errorText(
                  operation.error instanceof ApiClientError
                    ? operation.error.reason
                    : undefined,
                )}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={busy}
                onClick={() => {
                  void start(operation.input);
                }}
              >
                {t('pluginManager.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {overview.loading && !overview.data && !overview.error ? (
          <Loading />
        ) : null}
        {overview.data && !overview.error && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('pluginManager.repository')}</CardTitle>
                <CardDescription>
                  {t('pluginManager.repositoryDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='min-w-0'>
                  <p className='mb-1 font-medium'>
                    {t('pluginManager.publishTarget')}
                  </p>
                  <p className='break-all text-muted-foreground'>
                    {overview.data.data.registry}
                  </p>
                </div>
                <div className='min-w-0'>
                  <p className='mb-1 font-medium'>
                    {t('pluginManager.downloadTarget')}
                  </p>
                  <p className='break-all text-muted-foreground'>
                    {overview.data.data.downloadRegistry}
                  </p>
                </div>
                <p className='text-sm text-muted-foreground sm:col-span-2'>
                  {t(
                    overview.data.data.tokenConfigured
                      ? 'pluginManager.tokenConfigured'
                      : 'pluginManager.npmCredentials',
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('pluginManager.localPlugins')}</CardTitle>
                <CardDescription>
                  {t('pluginManager.sourceHint')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={pluginColumns}
                  data={overview.data.data.plugins}
                  pagination={false}
                  emptyMessage={t('pluginManager.empty')}
                />
              </CardContent>
            </Card>
          </>
        )}
        {!history.error && (
          <Card>
            <CardHeader>
              <CardTitle>{t('pluginManager.history')}</CardTitle>
              <CardDescription>
                {t('pluginManager.historyDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={runColumns}
                data={runs}
                loading={history.loading}
                manualPagination
                rowCount={history.data?.meta.total ?? 0}
                paginationState={pagination}
                onPaginationChange={setPagination}
                pageSizeOptions={[20, 50, 100]}
                emptyMessage={t('pluginManager.noHistory')}
              />
            </CardContent>
          </Card>
        )}
        <ConfirmAction
          open={confirm}
          title={t('pluginManager.publishConfirm')}
          description={t('pluginManager.publishDescription', {
            name: selected?.name,
            version: selected?.version,
            registry: overview.data?.data.registry,
          })}
          confirmLabel={t('pluginManager.publish')}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            if (selected)
              void start({
                pluginId: selected.pluginId,
                action: 'publish',
                sourceRunId: selected.id,
              });
          }}
        />
      </div>
    </SettingsModulePage>
  );
}
