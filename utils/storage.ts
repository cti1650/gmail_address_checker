import { storage } from "@wxt-dev/storage";

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
  warningLevel: 'off' | 'basic' | 'strict';
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
