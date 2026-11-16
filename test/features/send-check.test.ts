import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import type { Settings } from '../../utils/managed-policy'
import { composeWindow, render } from '../fixtures/gmail'

const baseSettings: Settings = {
  companyDomains: ['company.com'],
  trustedLinkDomains: [],
  extensionEnabled: true,
  linkCheckEnabled: true,
  warningSettings: { warningLevel: 'strict', bodyCheckEnabled: true },
}

vi.mock('../../utils/storage', () => ({
  getEffectiveSettings: vi.fn(),
}))

const ctx = {
  onInvalidated: vi.fn(),
  setTimeout: (handler: () => void, ms: number) => window.setTimeout(handler, ms),
} as unknown as ContentScriptContext

// 送信時チェックは表示状態をモジュール内に持つため、テストごとに読み込み直す
async function setup(settings: Settings = baseSettings) {
  vi.resetModules()
  const { getEffectiveSettings } = await import('../../utils/storage')
  vi.mocked(getEffectiveSettings).mockResolvedValue(settings)
  const { setupSendCheck } = await import('../../features/send-check')
  return setupSendCheck(ctx)
}

const isShown = (id: string) => document.getElementById(id)?.style.display === 'block'
const indicatorText = () => document.querySelector('#gmail-safe-indicator #indicator-message')?.textContent
const panelText = () => document.querySelector('#gmail-warning-panel #warning-message')?.textContent
const panelRecipients = () => document.querySelector('#gmail-warning-panel #recipients-list')?.innerHTML

describe('送信時チェック（scanCompose）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('作成画面がなければ何も表示しない', async () => {
    const sendCheck = await setup()
    render('<div>受信トレイ</div>')

    await sendCheck.scan()

    expect(isShown('gmail-safe-indicator')).toBe(false)
    expect(isShown('gmail-warning-panel')).toBe(false)
  })

  it('宛先が社内ドメインのみならインジケーターに「社内のみ」を表示する', async () => {
    const sendCheck = await setup()
    render(composeWindow({ to: ['team@company.com'] }))

    await sendCheck.scan()

    expect(isShown('gmail-safe-indicator')).toBe(true)
    expect(indicatorText()).toBe('社内のみ')
  })

  it('本文に記載のない社外ドメインがあれば詳細パネルで警告する', async () => {
    const sendCheck = await setup()
    render(composeWindow({ to: ['partner@partner.com'], body: '資料を送ります' }))

    await sendCheck.scan()

    expect(isShown('gmail-warning-panel')).toBe(true)
    expect(panelText()).toContain('本文に記載のない社外ドメイン: partner.com')
  })

  it('本文に記載済みの社外ドメインならインジケーターで注意を表示する', async () => {
    const sendCheck = await setup()
    render(composeWindow({ to: ['partner@partner.com'], body: 'support@partner.com 宛にご連絡します' }))

    await sendCheck.scan()

    expect(isShown('gmail-safe-indicator')).toBe(true)
    expect(isShown('gmail-warning-panel')).toBe(false)
    expect(indicatorText()).toBe('社外ドメイン 1件')
  })

  it('作成画面が複数あれば最も重い警告の作成画面の宛先を表示する', async () => {
    const sendCheck = await setup()
    render(
      composeWindow({ id: '3', to: ['team@company.com'], body: 'b@partner.com に転送します' }),
      composeWindow({ id: '4', to: ['b@partner.com'], body: '資料を送ります', minimized: true })
    )

    await sendCheck.scan()

    expect(isShown('gmail-warning-panel')).toBe(true)
    expect(panelRecipients()).toBe('TO: b@partner.com')
  })

  it('拡張機能が無効なら何も表示しない', async () => {
    const sendCheck = await setup({ ...baseSettings, extensionEnabled: false })
    render(composeWindow({ to: ['partner@partner.com'] }))

    await sendCheck.scan()

    expect(isShown('gmail-safe-indicator')).toBe(false)
    expect(isShown('gmail-warning-panel')).toBe(false)
  })
})
