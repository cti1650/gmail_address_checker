import { storage } from "@wxt-dev/storage";
import { parseManagedPolicy, resolveCompanyDomains, type ManagedPolicy, type WarningLevel } from "./managed-policy";

// 社内ドメインの設定を管理
export const companyDomainsStorage = storage.defineItem<string[]>(
  "local:companyDomains",
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
export const warningSettingsStorage = storage.defineItem<{
  warningLevel: WarningLevel;
  bodyCheckEnabled: boolean;
}>("sync:warningSettings", {
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

// 以下はポリシーで配布された値を優先した、判定に使う設定値

export async function getEffectiveCompanyDomains(): Promise<string[]> {
  const [policy, user] = await Promise.all([getManagedPolicy(), companyDomainsStorage.getValue()]);
  return resolveCompanyDomains(policy, user);
}

export async function getEffectiveExtensionEnabled(): Promise<boolean> {
  const policy = await getManagedPolicy();
  return policy.extensionEnabled ?? (await extensionEnabledStorage.getValue());
}

export async function getEffectiveLinkCheckEnabled(): Promise<boolean> {
  const policy = await getManagedPolicy();
  return policy.linkCheckEnabled ?? (await linkCheckEnabledStorage.getValue());
}

export async function getEffectiveWarningSettings(): Promise<{ warningLevel: WarningLevel; bodyCheckEnabled: boolean }> {
  const policy = await getManagedPolicy();
  if (policy.warningLevel) {
    return { warningLevel: policy.warningLevel, bodyCheckEnabled: policy.warningLevel === "strict" };
  }
  return warningSettingsStorage.getValue();
}
