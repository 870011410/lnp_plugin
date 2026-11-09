import type { AppServerPlugin } from '@nocobase/app-server/plugins';
/** Locale -> "namespace:key" -> public translated text. */
export type AuthorizationMessages = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;
/** Locale resource objects keyed by locale, as exported from an app's locale files. */
export type AuthorizationLocaleResources = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;
/** Build the same display dictionary for pages, actions, scopes and Collection titles. */
export declare function createAuthorizationMessages<
  Locales extends Readonly<Record<string, Readonly<Record<string, unknown>>>>,
>(
  namespace: string,
  locales: Locales,
): {
  readonly [Locale in keyof Locales]: Readonly<Record<string, string>>;
};
export interface AuthorizationBridgeOptions {
  appId: string;
  appVersion: string;
  pages: readonly {
    id: string;
    title: string | { key: string; ns?: string; defaultValue?: string };
    parentId?: string;
  }[];
  /** Locale -> "namespace:key" -> translated text. Only public display text belongs here. */
  messages?: AuthorizationMessages;
  /** App package namespace used by its LocalizedText descriptors. Required with locales. */
  localeNamespace?: string;
  /** App-owned locale resources. The bridge flattens their public string leaves into messages. */
  locales?: AuthorizationLocaleResources;
}
export declare function createAuthorizationBridge(
  options: AuthorizationBridgeOptions,
): AppServerPlugin;
