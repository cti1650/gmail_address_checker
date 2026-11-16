export interface EmailData {
  to: string[]
  cc: string[]
  bcc: string[]
  from: string
  body: string
}

const EMPTY_EMAIL_DATA: EmailData = { to: [], cc: [], bcc: [], from: '', body: '' }

// 指定した範囲（作成画面 1 つ、またはページ全体）から宛先・本文を取り出す
function extractEmailData(scope: ParentNode): EmailData {
  try {
    const toElements = scope.querySelectorAll('[name=to] [data-hovercard-id],form [aria-label=To] [data-hovercard-id]')
    const ccElements = scope.querySelectorAll('[name=cc] [data-hovercard-id],form [aria-label=Cc] [data-hovercard-id]')
    const bccElements = scope.querySelectorAll('[name=bcc] [data-hovercard-id],form [aria-label=Bcc] [data-hovercard-id]')

    const fromElement = scope.querySelector('input[name="from"]') as HTMLInputElement | null

    // 本文: 入力中の内容がそのまま反映される編集領域を優先し、なければ hidden input 等を使う
    // （hidden input は空のことや、HTML 文字列が入っていることがある）
    const bodyText = firstNonEmptyText(scope, [
      '[contenteditable="true"][role="textbox"]',
      '[name="body"]',
      '[data-name="body"]',
      '.gmail_default'
    ])
    const uetText = firstNonEmptyText(scope, ['[name="uet"]', '[data-name="uet"]'])

    // メールアドレスのバリデーションと重複除去
    const extractValidEmails = (elements: NodeList): string[] => {
      return Array.from(elements)
        .map(el => (el as Element).getAttribute('data-hovercard-id') || '')
        .filter(email => email && isValidEmail(email))
        .filter((email, index, array) => array.indexOf(email) === index)
    }

    return {
      to: extractValidEmails(toElements),
      cc: extractValidEmails(ccElements),
      bcc: extractValidEmails(bccElements),
      from: fromElement?.value || '',
      body: combineBodyText(bodyText, uetText),
    }
  } catch (error) {
    console.warn('Error getting email addresses:', error)
    return { ...EMPTY_EMAIL_DATA }
  }
}

function firstNonEmptyText(scope: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    for (const element of Array.from(scope.querySelectorAll(selector))) {
      const text = elementText(element)
      if (text.trim()) return text
    }
  }
  return ''
}

// 入力欄は value（HTML ならテキストに変換）、それ以外は textContent を使う
function elementText(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return /<[a-z][\s\S]*>/i.test(element.value) ? htmlToText(element.value) : element.value
  }
  return element.textContent || ''
}

// template 要素の中身は描画・スクリプト実行・画像読み込みが行われないため、安全にタグを除去できる
function htmlToText(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content.textContent || ''
}

// 作成画面の範囲を取得する。宛先欄から、作成画面の要素（data-compose-id）またはフォームの親要素をたどる
// （本文の編集領域はフォームの外にあるため、フォームの親要素を範囲にする）
function getComposeScopes(): Element[] {
  const scopes: Element[] = []
  document.querySelectorAll('[name="to"], form [aria-label="To"]').forEach((field) => {
    const scope = field.closest('[data-compose-id]') ?? field.closest('form')?.parentElement
    if (scope && !scopes.includes(scope)) scopes.push(scope)
  })
  return scopes
}

// 作成画面ごとの宛先・本文（最小化された作成画面も含む）
export function getComposeEmails(): EmailData[] {
  return getComposeScopes().map(extractEmailData)
}

// ページ全体の宛先・本文をまとめて取得する
export function getEmailAddresses(): EmailData {
  return extractEmailData(document)
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function combineBodyText(bodyText: string, uetText: string): string {
  const body = bodyText.trim()
  const uet = uetText.trim()
  
  if (!body && !uet) {
    return ''
  }
  
  if (!body) {
    return uet
  }
  
  if (!uet) {
    return body
  }
  
  return `${body}\n${uet}`
}

export function extractDomainFromEmail(email: string): string {
  return email.split('@')[1] || ''
}

export function getExternalDomains(recipients: string[], companyDomains: string[]): Set<string> {
  const externalDomains = new Set<string>()
  // ドメインは大文字小文字を区別しないため小文字で比較する
  const companyDomainsLower = companyDomains.map(d => d.toLowerCase())
  
  recipients.forEach(email => {
    const domain = extractDomainFromEmail(email).toLowerCase()
    if (domain && !companyDomainsLower.includes(domain)) {
      externalDomains.add(domain)
    }
  })
  
  return externalDomains
}

export function getDomainsInBody(body: string, domains: Set<string>, companyDomains: string[] = []): Set<string> {
  const domainsInBody = new Set<string>()
  const bodyLower = body.toLowerCase()
  const companyDomainsLower = companyDomains.map(d => d.toLowerCase())
  
  domains.forEach(domain => {
    const domainLower = domain.toLowerCase()
    
    // 社内ドメインは本文チェック対象から除外
    if (companyDomainsLower.includes(domainLower)) {
      return
    }
    
    // 1. @ドメイン形式での検索（最も一般的）
    const emailPattern = `@${domainLower}`
    if (bodyLower.includes(emailPattern)) {
      const emailRegex = new RegExp(`@${escapeRegExp(domainLower)}(?![a-zA-Z0-9.-])`, 'i')
      if (emailRegex.test(body)) {
        domainsInBody.add(domain)
        return
      }
    }
    
    // 2. URL形式での検索
    const urlPatterns = [
      `://${domainLower}`,      // https://domain.com
      `www.${domainLower}`,     // www.domain.com
    ]
    
    for (const pattern of urlPatterns) {
      if (bodyLower.includes(pattern)) {
        const urlRegex = new RegExp(`${escapeRegExp(pattern)}(?![a-zA-Z0-9.-])`, 'i')
        if (urlRegex.test(body)) {
          domainsInBody.add(domain)
          return
        }
      }
    }
    
    // 3. 単純なドメイン記載での検索（example.com そのもの）
    if (bodyLower.includes(domainLower)) {
      // 厳密なチェック: ドメインの前後が境界文字であることを確認
      // 英数字、ピリオド、ハイフン以外の文字で区切られているか、文字列の開始/終了
      const domainRegex = new RegExp(`(?<![a-zA-Z0-9.-])${escapeRegExp(domainLower)}(?![a-zA-Z0-9.-])`, 'i')
      if (domainRegex.test(body)) {
        domainsInBody.add(domain)
        return
      }
    }
  })
  
  return domainsInBody
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type WarningLevel = 'safe' | 'medium' | 'high'

export interface WarningSettings {
  warningLevel: 'off' | 'basic' | 'strict'
  bodyCheckEnabled: boolean
}

export interface WarningResult {
  level: WarningLevel
  message: string
  detailMessage: string
}

export function analyzeEmailSecurity(
  emails: EmailData,
  companyDomains: string[],
  warningSettings: WarningSettings
): WarningResult {
  const allRecipients = [...emails.to, ...emails.cc, ...emails.bcc].filter(Boolean)
  
  if (allRecipients.length === 0) {
    return {
      level: 'safe',
      message: '送信先なし',
      detailMessage: '送信先が設定されていません'
    }
  }
  
  if (warningSettings.warningLevel === 'off') {
    return {
      level: 'safe',
      message: 'チェック無効',
      detailMessage: 'セキュリティチェックが無効になっています'
    }
  }
  
  // 社内ドメインが設定されていない場合の警告
  if (companyDomains.length === 0) {
    return {
      level: 'medium',
      message: '社内ドメイン未設定',
      detailMessage: '社内ドメインが設定されていません。拡張機能のポップアップから設定してください。'
    }
  }
  
  const externalDomains = getExternalDomains(allRecipients, companyDomains)
  
  if (externalDomains.size === 0) {
    return {
      level: 'safe',
      message: '社内のみ',
      detailMessage: 'すべて社内ドメインです'
    }
  }
  
  if (warningSettings.bodyCheckEnabled) {
    // 厳格モード: 本文チェックを行う（社内ドメインは除外）
    const externalDomainsInBody = getDomainsInBody(emails.body, externalDomains, companyDomains)
    const notInBodyDomains = new Set([...externalDomains].filter(d => !externalDomainsInBody.has(d)))
    
    if (notInBodyDomains.size > 0) {
      // 本文に記載のない社外ドメインがある → 高警告
      return {
        level: 'high',
        message: `社外ドメイン ${externalDomains.size}件`,
        detailMessage: `本文に記載のない社外ドメイン: ${Array.from(notInBodyDomains).join(', ')}`
      }
    } else {
      // すべて本文に記載済み → 注意
      return {
        level: 'medium',
        message: `社外ドメイン ${externalDomains.size}件`,
        detailMessage: `本文に記載済みの社外ドメイン: ${Array.from(externalDomainsInBody).join(', ')}`
      }
    }
  } else {
    // 基本モード: 本文チェックなし、社外ドメインがあれば注意
    return {
      level: 'medium',
      message: `社外ドメイン ${externalDomains.size}件`,
      detailMessage: `社外ドメイン: ${Array.from(externalDomains).join(', ')}`
    }
  }
}

const SEVERITY: Record<WarningLevel, number> = { safe: 0, medium: 1, high: 2 }

// 作成画面ごとの判定結果から、最も重い警告を選ぶ（同じ重さなら先頭を優先）
export function pickMostSevere<T extends { result: WarningResult }>(items: T[]): T | null {
  return items.reduce<T | null>((worst, item) => (
    !worst || SEVERITY[item.result.level] > SEVERITY[worst.result.level] ? item : worst
  ), null)
}

export function setsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) return false
  for (const item of set1) {
    if (!set2.has(item)) return false
  }
  return true
}