import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/storage', () => ({
  getEffectiveSettings: vi.fn().mockResolvedValue({
    companyDomains: [],
    extensionEnabled: true,
    linkCheckEnabled: true,
    warningSettings: { warningLevel: 'strict', bodyCheckEnabled: true },
  }),
}))

import { scanLinks, __testing } from '../../features/link-check'

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
})
