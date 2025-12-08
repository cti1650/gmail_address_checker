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

// 警告表示設定
export const warningSettingsStorage = storage.defineItem<{
  showForSingleExternal: boolean;
  showForMultipleExternal: boolean;
  showForBccExternal: boolean;
  showForNewConversation: boolean;
  enableBodyCheck: boolean;
}>("sync:warningSettings", {
  defaultValue: {
    showForSingleExternal: true,
    showForMultipleExternal: true,
    showForBccExternal: true,
    showForNewConversation: true,
    enableBodyCheck: true,
  },
  version: 2,
});
