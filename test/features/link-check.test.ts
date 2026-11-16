import { describe, it, expect, vi, beforeEach } from 'vitest'

const baseSettings = {
  companyDomains: [] as string[],
  trustedLinkDomains: [] as string[],
  extensionEnabled: true,
  linkCheckEnabled: true,
  warningSettings: { warningLevel: 'strict' as const, bodyCheckEnabled: true },
}

vi.mock('../../utils/storage', () => ({
  getEffectiveSettings: vi.fn(),
}))

import { scanLinks, __testing } from '../../features/link-check'
import { getEffectiveSettings } from '../../utils/storage'

const { LINK_CHECKED_ATTR, LINK_FLAGGED_ATTR } = __testing

function renderMessage(href: string, text: string): HTMLAnchorElement {
  document.body.innerHTML = `
    <div data-message-id="m1">
      <span email="sender@example.com"></span>
      <div vlink><a href="${href}">${text}</a></div>
    </div>
  `
  return document.querySelector('a') as HTMLAnchorElement
}

describe('scanLinks', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(getEffectiveSettings).mockResolvedValue(baseSettings)
  })

  it('チェック時の href を記録する', async () => {
    const anchor = renderMessage('https://example.com/a', 'https://example.com/a')
    await scanLinks()

    expect(anchor.getAttribute(LINK_CHECKED_ATTR)).toBe('https://example.com/a')
    expect(anchor.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)
  })

  it('href が書き換えられたら再判定して警告する', async () => {
    const anchor = renderMessage('https://example.com/a', 'https://example.com/a')
    await scanLinks()
    expect(anchor.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)

    anchor.setAttribute('href', 'https://evil.test/a')
    await scanLinks()

    expect(anchor.getAttribute(LINK_FLAGGED_ATTR)).toBe('mismatch')
  })

  it('href が安全なものに書き換えられたら警告を外す', async () => {
    const anchor = renderMessage('https://evil.test/a', 'https://example.com/a')
    await scanLinks()
    expect(anchor.getAttribute(LINK_FLAGGED_ATTR)).toBe('mismatch')

    anchor.setAttribute('href', 'https://example.com/a')
    await scanLinks()

    expect(anchor.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)
  })

  it('信頼するドメインが追加されたら、チェック済みのリンクも再判定して警告を外す', async () => {
    const anchor = renderMessage('https://evil.test/a', 'https://example.com/a')
    await scanLinks()
    expect(anchor.getAttribute(LINK_FLAGGED_ATTR)).toBe('mismatch')

    vi.mocked(getEffectiveSettings).mockResolvedValue({ ...baseSettings, trustedLinkDomains: ['evil.test'] })
    await scanLinks()

    expect(anchor.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)
  })

  it('[vlink] がないメール（プレーンテキスト）ではメッセージ全体のリンクを判定する', async () => {
    // 実際の Gmail の閲覧画面の構造を簡略化したもの（クラス名は判定に使わない）
    document.body.innerHTML = `
      <div class="adn ads" data-message-id="#msg-f:1">
        <div class="gE">
          <span email="sender@example.com" class="gD">sender</span>
          <span class="hb">To <span email="me@company.com" class="g2">自分</span></span>
        </div>
        <div class="ii gt"><div class="a3s aiL">
          <a href="https://evil.test/">https://example.com</a>
          <a href="https://www.example.com/news">お知らせ</a>
        </div></div>
      </div>
    `
    await scanLinks()

    const [mismatchLink, relatedLink] = Array.from(document.querySelectorAll('a'))
    expect(mismatchLink?.getAttribute(LINK_FLAGGED_ATTR)).toBe('mismatch')
    expect(relatedLink?.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)
  })
})
