import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { getEffectiveSettings } from '../utils/storage'
import { checkLink, type LinkCheckResult } from '../utils/link-check'

const LINK_CHECKED_ATTR = 'data-gmail-link-checked'
const LINK_FLAGGED_ATTR = 'data-gmail-link-flagged'
const LINK_HREF_HOST_ATTR = 'data-gmail-link-href-host'
const LINK_DISPLAY_HOST_ATTR = 'data-gmail-link-display-host'
const LINK_RELATED_ATTR = 'data-gmail-link-related'
const LINK_PROTOCOL_ATTR = 'data-gmail-link-protocol'
const STYLE_ELEMENT_ID = 'gmail-link-flag-styles'
const TOOLTIP_ELEMENT_ID = 'gmail-link-flag-tooltip'

// 受信メール内のリンクスキャン (毎tick呼び出し)
export async function scanLinks(): Promise<void> {
  try {
    const settings = await getEffectiveSettings()
    if (!settings.linkCheckEnabled || !settings.extensionEnabled) {
      unmarkAllLinks()
      return
    }

    // 受信メールの個別メッセージ ([data-message-id]) ごとに走査
    // 本文の [vlink] 要素があればそのスコープに絞る (ヘッダーのリンクを除外)
    // 無ければメッセージ全体にフォールバック
    const messages = document.querySelectorAll('[data-message-id]')
    messages.forEach((message) => {
      const relatedDomains = collectRelatedDomains(message)
      const bodyScope = message.querySelector('[vlink]') ?? message
      const anchors = bodyScope.querySelectorAll<HTMLAnchorElement>('a[href]')
      anchors.forEach((anchor) => {
        // チェック時の href を記録し、Gmail が href を書き換えた場合は再判定する
        const href = anchor.getAttribute('href') || ''
        if (anchor.getAttribute(LINK_CHECKED_ATTR) === href) return
        anchor.setAttribute(LINK_CHECKED_ATTR, href)
        unflagLink(anchor)

        const result = checkLink(anchor, relatedDomains)
        if (result.type) {
          flagLink(anchor, result)
        }
      })
    })
  } catch (error) {
    /* noop: extension context invalidated 等は無視 */
  }
}

// 初期化: スタイル注入とホバーリスナー設定 (main()で1回だけ呼ぶ)
// ctx 経由でイベントリスナーを登録し、context 無効化時に自動 cleanup
export function setupLinkCheck(ctx: ContentScriptContext): { scan: () => Promise<void> } {
  injectStyles()
  ensureTooltipElement()
  setupHoverListeners(ctx)
  return { scan: scanLinks }
}

function collectRelatedDomains(scope: Element): string[] {
  const domains = new Set<string>()
  scope.querySelectorAll('[email]').forEach((el) => {
    const email = el.getAttribute('email') || ''
    const at = email.indexOf('@')
    if (at < 0) return
    const domain = email.slice(at + 1).trim().toLowerCase()
    if (domain) domains.add(domain)
  })
  return Array.from(domains)
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = `
    a[${LINK_FLAGGED_ATTR}] {
      outline: 3px solid #ea4335 !important;
      margin: 2px !important;
    }
    #${TOOLTIP_ELEMENT_ID} {
      position: fixed;
      background: #d93025;
      color: #ffffff;
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      border-radius: 6px;
      min-width: 220px;
      max-width: 360px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 2147483647;
      pointer-events: none;
      display: none;
      overflow: hidden;
    }
    #${TOOLTIP_ELEMENT_ID} .gmlc-title {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      background: rgba(0,0,0,0.12);
    }
    #${TOOLTIP_ELEMENT_ID} .gmlc-body {
      padding: 8px 12px;
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 10px;
      row-gap: 4px;
    }
    #${TOOLTIP_ELEMENT_ID} .gmlc-label {
      opacity: 0.8;
      font-size: 11px;
    }
    #${TOOLTIP_ELEMENT_ID} .gmlc-value {
      font-family: 'Roboto Mono', Menlo, Consolas, monospace;
      font-size: 12px;
      word-break: break-all;
    }
    #${TOOLTIP_ELEMENT_ID} .gmlc-value.gmlc-mismatch {
      font-weight: 700;
    }
  `
  ;(document.head || document.documentElement).appendChild(style)
}

function ensureTooltipElement(): void {
  if (document.getElementById(TOOLTIP_ELEMENT_ID)) return
  const tooltip = document.createElement('div')
  tooltip.id = TOOLTIP_ELEMENT_ID
  document.body.appendChild(tooltip)
}

function setupHoverListeners(ctx: ContentScriptContext): void {
  // mouseover/mouseout は bubble するので document でデリゲーション
  let currentHovered: HTMLAnchorElement | null = null
  ctx.addEventListener(document, 'mouseover', (e) => {
    const target = e.target as Element | null
    const a = target?.closest?.(`a[${LINK_FLAGGED_ATTR}]`) as HTMLAnchorElement | null
    if (a === currentHovered) return
    currentHovered = a
    if (a) showLinkTooltip(a)
    else hideLinkTooltip()
  })
  ctx.addEventListener(document, 'scroll', hideLinkTooltip, { capture: true })
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[c] ?? c
  })
}

export function buildTooltipHtml(anchor: HTMLAnchorElement): string {
  const type = anchor.getAttribute(LINK_FLAGGED_ATTR)
  const hrefHost = escapeHtml(anchor.getAttribute(LINK_HREF_HOST_ATTR) || '')
  if (type === 'unsafe-protocol') {
    const protocol = escapeHtml(anchor.getAttribute(LINK_PROTOCOL_ATTR) || '')
    return `
      <div class="gmlc-title">🚨 危険なプロトコル</div>
      <div class="gmlc-body">
        <span class="gmlc-label">種類</span><span class="gmlc-value gmlc-mismatch">${protocol}:</span>
      </div>
    `
  }
  if (type === 'unrelated') {
    const related = escapeHtml(anchor.getAttribute(LINK_RELATED_ATTR) || '')
    return `
      <div class="gmlc-title">⚠️ 送信元と無関係なリンク</div>
      <div class="gmlc-body">
        <span class="gmlc-label">リンク先</span><span class="gmlc-value gmlc-mismatch">${hrefHost}</span>
        <span class="gmlc-label">関連</span><span class="gmlc-value">${related || '不明'}</span>
      </div>
    `
  }
  // mismatch
  const displayHost = escapeHtml(anchor.getAttribute(LINK_DISPLAY_HOST_ATTR) || '')
  return `
    <div class="gmlc-title">⚠️ リンク先の偽装の可能性</div>
    <div class="gmlc-body">
      <span class="gmlc-label">表示</span><span class="gmlc-value">${displayHost}</span>
      <span class="gmlc-label">実際</span><span class="gmlc-value gmlc-mismatch">${hrefHost}</span>
    </div>
  `
}

function showLinkTooltip(anchor: HTMLAnchorElement): void {
  const tooltip = document.getElementById(TOOLTIP_ELEMENT_ID)
  if (!tooltip) return
  tooltip.innerHTML = buildTooltipHtml(anchor)
  tooltip.style.display = 'block'

  const rect = anchor.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()
  let top = rect.bottom + 6
  let left = rect.left
  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - tooltipRect.width - 8)
  }
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - tooltipRect.height - 6)
  }
  tooltip.style.top = `${top}px`
  tooltip.style.left = `${left}px`
}

function hideLinkTooltip(): void {
  const tooltip = document.getElementById(TOOLTIP_ELEMENT_ID)
  if (tooltip) tooltip.style.display = 'none'
}

function flagLink(anchor: HTMLAnchorElement, result: LinkCheckResult): void {
  anchor.setAttribute(LINK_FLAGGED_ATTR, result.type as string)
  if (result.hrefHost) {
    anchor.setAttribute(LINK_HREF_HOST_ATTR, result.hrefHost)
  }
  if (result.displayHost) {
    anchor.setAttribute(LINK_DISPLAY_HOST_ATTR, result.displayHost)
  }
  if (result.relatedDomains && result.relatedDomains.length > 0) {
    // 最大3件まで表示用に保存
    anchor.setAttribute(LINK_RELATED_ATTR, result.relatedDomains.slice(0, 3).join(', '))
  }
  if (result.protocol) {
    anchor.setAttribute(LINK_PROTOCOL_ATTR, result.protocol)
  }
}

function unflagLink(anchor: HTMLAnchorElement): void {
  anchor.removeAttribute(LINK_FLAGGED_ATTR)
  anchor.removeAttribute(LINK_HREF_HOST_ATTR)
  anchor.removeAttribute(LINK_DISPLAY_HOST_ATTR)
  anchor.removeAttribute(LINK_RELATED_ATTR)
  anchor.removeAttribute(LINK_PROTOCOL_ATTR)
}

function unmarkAllLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>(`a[${LINK_FLAGGED_ATTR}]`).forEach(unflagLink)
  document.querySelectorAll<HTMLAnchorElement>(`a[${LINK_CHECKED_ATTR}]`).forEach((a) => {
    a.removeAttribute(LINK_CHECKED_ATTR)
  })
  hideLinkTooltip()
}

// テスト用エクスポート
export const __testing = {
  collectRelatedDomains,
  LINK_CHECKED_ATTR,
  flagLink,
  unmarkAllLinks,
  LINK_FLAGGED_ATTR,
  LINK_HREF_HOST_ATTR,
  LINK_DISPLAY_HOST_ATTR,
  LINK_RELATED_ATTR,
  LINK_PROTOCOL_ATTR,
}
