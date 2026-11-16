export type LinkFlagType = 'mismatch' | 'unrelated' | 'unsafe-protocol'

export interface LinkCheckResult {
  type: LinkFlagType | null
  displayHost?: string
  hrefHost?: string
  relatedDomains?: string[]
  protocol?: string
}

// http(s) 以外で許可するプロトコル (これら以外は危険として警告)
const ALLOWED_NON_HTTP_PROTOCOLS = new Set(['mailto:', 'tel:', 'sms:'])

function getProtocol(href: string): string | null {
  try {
    return new URL(href).protocol
  } catch {
    return null
  }
}

const URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,24})(?:[\/?#][^\s]*)?/gi

export function extractHostsFromText(text: string): string[] {
  const hosts: string[] = []
  URL_PATTERN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_PATTERN.exec(text)) !== null) {
    if (m[1]) hosts.push(m[1].toLowerCase())
  }
  return hosts
}

import { getDomain } from 'tldts'

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

// Public Suffix List ベースで登録可能ドメイン (eTLD+1) を取得
// IPアドレス・localhost等の特殊ケースでは tldts が null を返すので、その場合は正規化ホストにフォールバック
export function getRegistrableDomain(host: string): string {
  const lower = host.toLowerCase()
  return getDomain(lower) || normalizeHost(lower)
}

export function hostsMatch(a: string, b: string): boolean {
  return getRegistrableDomain(a) === getRegistrableDomain(b)
}

// Gmailのリダイレクトラッパー (https://www.google.com/url?q=...) から実URLを取り出す
export function unwrapGoogleRedirect(href: string): string {
  try {
    const url = new URL(href)
    if (url.hostname === 'www.google.com' && url.pathname === '/url') {
      const q = url.searchParams.get('q')
      if (q) return q
    }
  } catch {
    /* noop */
  }
  return href
}

export function getHrefHost(href: string): string | null {
  try {
    const url = new URL(href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname
  } catch {
    return null
  }
}

// trustedDomains: リンク先がこれらのドメインなら偽装・無関係として扱わない（危険プロトコルは常に検知）
export function checkLink(
  anchor: HTMLAnchorElement,
  relatedDomains: string[] = [],
  trustedDomains: string[] = []
): LinkCheckResult {
  const rawHref = anchor.getAttribute('href') || anchor.href
  if (!rawHref) return { type: null }

  const realHref = unwrapGoogleRedirect(rawHref)

  // 危険プロトコルチェック (javascript:, data:, vbscript:, file: など)
  const proto = getProtocol(realHref)
  if (proto && proto !== 'http:' && proto !== 'https:') {
    if (!ALLOWED_NON_HTTP_PROTOCOLS.has(proto)) {
      return { type: 'unsafe-protocol', protocol: proto.replace(/:$/, '') }
    }
    // 許可された非HTTPプロトコル (mailto, tel, sms) はスルー
    return { type: null }
  }

  const hrefHost = getHrefHost(realHref)
  if (!hrefHost) return { type: null }
  if (trustedDomains.some((d) => hostsMatch(d, hrefHost))) return { type: null }

  const text = (anchor.textContent || '').trim()
  const textHosts = text ? extractHostsFromText(text) : []

  // 1. 表示テキストにURL/ドメインがある場合は href ホストと比較
  if (textHosts.length > 0) {
    const mismatched = textHosts.find((h) => !hostsMatch(h, hrefHost))
    if (mismatched) {
      return { type: 'mismatch', displayHost: mismatched, hrefHost }
    }
    return { type: null }
  }

  // 2. 表示にURL/ドメインなし (画像リンク・ボタンリンク) → 関連ドメインと比較
  if (relatedDomains.length === 0) {
    return { type: null }
  }
  const matches = relatedDomains.some((d) => hostsMatch(d, hrefHost))
  if (matches) return { type: null }
  return { type: 'unrelated', hrefHost, relatedDomains }
}
