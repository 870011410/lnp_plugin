# Local plugin management

Read [the operator guide](../../docs/plugin-manager.md) before changing plugin discovery, release tasks or registry credentials. This is an application-owned, unrestricted-administrator-only development tool; it is not a NocoBase plugin installer. Source plugins live in `packages/`; the application currently has no local plugin sources.

The page is `client/pages/settings/plugin-manager/`, mounted under the existing System settings category. `server/providers/plugin-manager/` owns local task receipts, locks, archive validation and npm publication; `server/routes/plugin-manager.ts` owns HTTP authentication and authorization. Jobs use the existing app JobExecutor. CLI commands reuse the service without starting application workers. The file store is single-process: do not introduce multiple workers or shared-storage instances without replacing the recovery/locking design.

Publish to the configured npm hosted repository and download from the configured group. Never auto-select another repository. Preserve immutable artifacts and digest checks, replay of idempotent submissions, interrupted-run recovery without automatic republication, scoped credentials and no command output or secrets in API responses. Keep credentials in the local ignored configuration/npm login or server environment; never commit them. The production `tar` dependency validates archives without extraction.

Run focused service, route, page and CLI tests when changing this feature, plus application route and permission-title tests for registration changes. Tests must use temporary storage and a temporary npm registry; never publish fixture packages to the real Nexus repository.
