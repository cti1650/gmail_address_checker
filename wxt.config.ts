import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Gmail Address Checker',
    permissions: [
      'activeTab',
      'storage'
    ],
    host_permissions: [
      'https://mail.google.com/*'
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'"
    }
  }
});