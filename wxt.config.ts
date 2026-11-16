import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: ({ browser }) => ({
    name: 'Gmail Address Checker',
    permissions: [
      'storage'
    ],
    host_permissions: [
      'https://mail.google.com/*'
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'"
    },
    // 組織ポリシー（Google Workspace 管理コンソール）からの設定配布用スキーマ（Chromium 系のみ。Firefox は manifest で未サポート）
    ...(browser !== 'firefox' ? { storage: { managed_schema: 'managed_schema.json' } } : {})
  })
});