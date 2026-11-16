export interface EmailData {
  to: string[]
  cc: string[]
  bcc: string[]
  from: string
  body: string
}

function getActiveComposeWindow(): Element | null {
  // まず従来の方法で基本的なメール作成画面があるかチェック
  const basicComposeCheck = document.querySelector('[aria-label="新規メッセージ"], form[enctype="multipart/form-data"]')
  if (!basicComposeCheck) {
    return null
  }
  
  // Gmailのメール作成画面を特定するための複数のセレクタパターン
  const composeSelectors = [
    '[aria-label="新規メッセージ"]',
    '[role="dialog"][aria-label*="メッセージ"]',
    '[role="dialog"][aria-label*="Message"]',
    '.nH[role="dialog"]', // Gmail の一般的なダイアログクラス
    'form[enctype="multipart/form-data"]', // メール送信フォーム
  ]
  
  let composeWindows: Element[] = []
  
  // 各セレクタで検索してメール作成画面を収集
  for (const selector of composeSelectors) {
    const elements = Array.from(document.querySelectorAll(selector))
    
    // メール作成に関連する要素かどうかを確認
    const relevantElements = elements.filter(element => {
      // To, CC, BCC, 本文フィールドのいずれかが含まれているかチェック
      const hasToField = element.querySelector('[name="to"]') !== null
      const hasCcField = element.querySelector('[name="cc"]') !== null
      const hasBccField = element.querySelector('[name="bcc"]') !== null
      const hasBodyField = element.querySelector('[name="body"], [contenteditable="true"][role="textbox"]') !== null
      
      return hasToField || hasCcField || hasBccField || hasBodyField
    })
    
    composeWindows.push(...relevantElements)
  }
  
  // 重複を除去
  composeWindows = composeWindows.filter((element, index, array) => 
    array.indexOf(element) === index
  )
  
  if (composeWindows.length === 0) {
    return null
  }
  
  if (composeWindows.length === 1) {
    return composeWindows[0] ?? null
  }
  
  // 複数のメール作成画面がある場合、最前面のものを特定
  return getTopMostComposeWindow(composeWindows)
}

function getTopMostComposeWindow(composeWindows: Element[]): Element | null {
  // まず表示されている要素のみにフィルター
  const visibleWindows = composeWindows.filter(window => {
    const element = window as HTMLElement
    const computedStyle = getComputedStyle(element)
    
    return computedStyle.display !== 'none' && 
           computedStyle.visibility !== 'hidden' && 
           element.offsetWidth > 0 && 
           element.offsetHeight > 0
  })
  
  if (visibleWindows.length === 0) {
    return null
  }
  
  if (visibleWindows.length === 1) {
    return visibleWindows[0] ?? null
  }
  
  // z-indexでソート（高い順）
  const sortedByZIndex = [...visibleWindows].sort((a, b) => {
    const aElement = a as HTMLElement
    const bElement = b as HTMLElement
    
    const aZIndex = parseInt(getComputedStyle(aElement).zIndex) || 0
    const bZIndex = parseInt(getComputedStyle(bElement).zIndex) || 0
    
    // z-indexが異なる場合は高い順
    if (aZIndex !== bZIndex) {
      return bZIndex - aZIndex
    }
    
    // z-indexが同じ場合は、DOM順序で後のもの（より新しく追加されたもの）を優先
    const allElements = Array.from(document.body.querySelectorAll('*'))
    const aPosition = allElements.indexOf(aElement)
    const bPosition = allElements.indexOf(bElement)
    
    return bPosition - aPosition
  })
  
  return sortedByZIndex[0] ?? null
}

function getEmailAddressesLegacy(): EmailData {
  try {
    // To, CC, BCCのメールアドレスを取得（従来の方法）
    const toElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=to] [data-hovercard-id],form [aria-label=To] [data-hovercard-id]')
    const ccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=cc] [data-hovercard-id],form [aria-label=Cc] [data-hovercard-id]')
    const bccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=bcc] [data-hovercard-id],form [aria-label=Bcc] [data-hovercard-id]')
    
    // Fromアドレスを取得
    const fromElement = document.querySelector('input[name="from"]') as HTMLInputElement
    
    // メール本文を取得 - 複数のセレクタを試行
    const bodySelectors = [
      '[name="body"]',
      '[data-name="body"]',
      '.gmail_default',
      '[contenteditable="true"][role="textbox"]'
    ]
    
    let bodyText = ''
    for (const selector of bodySelectors) {
      const bodyElement = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLElement
      if (bodyElement) {
        bodyText = bodyElement.textContent || bodyElement.innerText || (bodyElement as any).value || ''
        break
      }
    }

    // UETフィールドを取得 - 複数のセレクタを試行
    const uetSelectors = [
      '[name="uet"]',
      '[data-name="uet"]'
    ]
    
    let uetText = ''
    for (const selector of uetSelectors) {
      const uetElement = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement
      if (uetElement) {
        uetText = uetElement.value || ''
        break
      }
    }
    
    // メールアドレスのバリデーションと重複除去
    const extractValidEmails = (elements: NodeList): string[] => {
      return Array.from(elements)
        .map(el => (el as Element).getAttribute('data-hovercard-id') || '')
        .filter(email => email && isValidEmail(email))
        .filter((email, index, array) => array.indexOf(email) === index) // 重複除去
    }
    
    return {
      to: extractValidEmails(toElements),
      cc: extractValidEmails(ccElements),
      bcc: extractValidEmails(bccElements),
      from: fromElement?.value || '',
      body: combineBodyText(bodyText, uetText),
    }
  } catch (error) {
    console.warn('Error getting email addresses (legacy):', error)
    return {
      to: [],
      cc: [],
      bcc: [],
      from: '',
      body: '',
    }
  }
}

export function getEmailAddresses(): EmailData {
  // 一時的に複数ウィンドウ対応を無効化し、安定した従来の動作に戻す
  return getEmailAddressesLegacy()
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
  
  recipients.forEach(email => {
    const domain = extractDomainFromEmail(email)
    if (domain && !companyDomains.includes(domain)) {
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

export function setsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) return false
  for (const item of set1) {
    if (!set2.has(item)) return false
  }
  return true
}