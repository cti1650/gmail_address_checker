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
import { receivedMessage, render } from '../fixtures/gmail'

const { LINK_CHECKED_ATTR, LINK_FLAGGED_ATTR } = __testing

// リンク 1 つの受信メールを描画し、そのリンクを返す
function renderMessage(href: string, text: string): HTMLAnchorElement {
  render(receivedMessage({ from: 'sender@example.com', links: [{ href, text }], vlink: true }))
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
    render(receivedMessage({
      from: 'sender@example.com',
      to: ['me@company.com'],
      links: [
        { href: 'https://evil.test/', text: 'https://example.com' },
        { href: 'https://www.example.com/news', text: 'お知らせ' },
      ],
    }))
    await scanLinks()

    const [mismatchLink, relatedLink] = Array.from(document.querySelectorAll('a'))
    expect(mismatchLink?.getAttribute(LINK_FLAGGED_ATTR)).toBe('mismatch')
    expect(relatedLink?.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)
  })

  it('画像リンク（表示に URL なし）は送信元・受信者と無関係なドメインなら警告する', async () => {
    render(receivedMessage({
      from: 'sender@example.com',
      to: ['me@company.com'],
      links: [
        { href: 'https://unrelated.test/', text: '<img src="banner.png" alt="">' },
        { href: 'https://news.example.com/', text: '<img src="logo.png" alt="">' },
      ],
    }))
    await scanLinks()

    const [unrelatedLink, relatedLink] = Array.from(document.querySelectorAll('a'))
    expect(unrelatedLink?.getAttribute(LINK_FLAGGED_ATTR)).toBe('unrelated')
    expect(relatedLink?.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)
  })

  it('リンクチェックが無効になったら警告をすべて外す', async () => {
    const anchor = renderMessage('https://evil.test/a', 'https://example.com/a')
    await scanLinks()
    expect(anchor.getAttribute(LINK_FLAGGED_ATTR)).toBe('mismatch')

    vi.mocked(getEffectiveSettings).mockResolvedValue({ ...baseSettings, linkCheckEnabled: false })
    await scanLinks()

    expect(anchor.hasAttribute(LINK_FLAGGED_ATTR)).toBe(false)
  })

  it('メール一覧（[data-message-id] なし）のリンクは判定しない', async () => {
    render('<table role="grid"><tr><td><a href="https://evil.test/">https://example.com</a></td></tr></table>')
    await scanLinks()

    expect(document.querySelector('a')?.hasAttribute(LINK_CHECKED_ATTR)).toBe(false)
  })
})
