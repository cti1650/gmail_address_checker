import { storage } from "@wxt-dev/storage";
import { browser } from "wxt/browser";
import { parseManagedPolicy, resolveEffectiveSettings, type ManagedPolicy, type Settings, type WarningSettings } from "./managed-policy";

// 社内ドメインの設定を管理
export const companyDomainsStorage = storage.defineItem<string[]>(
  "local:companyDomains",
  {
    defaultValue: [],
    version: 1,
  }
);

// リンクチェックで信頼するドメイン（ユーザー設定分）
export const trustedLinkDomainsStorage = storage.defineItem<string[]>(
  "local:trustedLinkDomains",
  {
    defaultValue: [],
    version: 1,
  }
);

// 警告履歴を管理（オプション）
export const warningHistoryStorage = storage.defineItem<
  {
    timestamp: number;
    message: string;
    level: "medium" | "high";
  }[]
>("local:warningHistory", {
  defaultValue: [],
  version: 1,
});

// 拡張機能の有効/無効状態
export const extensionEnabledStorage = storage.defineItem<boolean>(
  "sync:extensionEnabled",
  {
    defaultValue: true,
    version: 1,
  }
);

// 警告表示設定（簡素化）
export const warningSettingsStorage = storage.defineItem<WarningSettings>("sync:warningSettings", {
  defaultValue: {
    warningLevel: 'strict',
    bodyCheckEnabled: true,
  },
  version: 4,
});

// 受信メールのリンクチェック有効/無効
export const linkCheckEnabledStorage = storage.defineItem<boolean>(
  "sync:linkCheckEnabled",
  {
    defaultValue: true,
    version: 1,
  }
);

// 組織ポリシー（Google Workspace / Chrome Enterprise）で配布される設定（読み取り専用）
const MANAGED_KEYS = [
  "companyDomains",
  "trustedLinkDomains",
  "allowUserDomains",
  "warningLevel",
  "extensionEnabled",
  "linkCheckEnabled",
] as const;

// managed storage 非対応環境（Firefox等）やポリシー未配布時は、すべて未配布として扱う
export async function getManagedPolicy(): Promise<ManagedPolicy> {
  try {
    const items = await storage.getItems(MANAGED_KEYS.map((key) => `managed:${key}` as const));
    const raw: Record<string, unknown> = {};
    items.forEach(({ key, value }) => {
      raw[key.replace(/^managed:/, "")] = value;
    });
    return parseManagedPolicy(raw);
  } catch {
    return parseManagedPolicy({});
  }
}

// 判定に使う設定値（ポリシーで配布された項目はユーザー設定より優先）
async function loadEffectiveSettings(): Promise<Settings> {
  const [policy, companyDomains, trustedLinkDomains, extensionEnabled, linkCheckEnabled, warningSettings] = await Promise.all([
    getManagedPolicy(),
    companyDomainsStorage.getValue(),
    trustedLinkDomainsStorage.getValue(),
    extensionEnabledStorage.getValue(),
    linkCheckEnabledStorage.getValue(),
    warningSettingsStorage.getValue(),
  ]);
  return resolveEffectiveSettings(policy, { companyDomains, trustedLinkDomains, extensionEnabled, linkCheckEnabled, warningSettings });
}

// watchSettingsChanges() で変更監視中のみキャッシュする（監視なしでは毎回読み込む）
let settingsCache: Promise<Settings> | null = null;
let cacheEnabled = false;

export function getEffectiveSettings(): Promise<Settings> {
  if (!cacheEnabled) return loadEffectiveSettings();
  if (!settingsCache) {
    const loading = loadEffectiveSettings();
    settingsCache = loading;
    loading.catch(() => {
      if (settingsCache === loading) settingsCache = null;
    });
  }
  return settingsCache;
}

// ストレージ（local / sync / managed）の変更でキャッシュを破棄する。戻り値は監視の解除関数
export function watchSettingsChanges(): () => void {
  const listener = () => {
    settingsCache = null;
  };
  cacheEnabled = true;
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
    cacheEnabled = false;
    settingsCache = null;
  };
}
