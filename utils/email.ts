export interface EmailData {
  to: string[]
  cc: string[]
  bcc: string[]
  from: string
  body: string
}

export function getEmailAddresses(): EmailData {
  // To, CC, BCCのメールアドレスを取得
  const toElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=to] [data-hovercard-id],form [aria-label=To] [data-hovercard-id]')
  const ccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=cc] [data-hovercard-id],form [aria-label=Cc] [data-hovercard-id]')
  const bccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=bcc] [data-hovercard-id],form [aria-label=Bcc] [data-hovercard-id]')
  
  // Fromアドレスを取得
  const fromElement = document.querySelector('input[name="from"]') as HTMLInputElement
  
  // メール本文を取得
  const bodyElement = document.querySelector('[name="body"]') as HTMLInputElement | HTMLTextAreaElement
  const bodyText = bodyElement?.value || ''

  // UETフィールドを取得
  const uetElement = document.querySelector('[name="uet"]') as HTMLInputElement | HTMLTextAreaElement
  const uetText = uetElement?.value || ''
  
  return {
    to: Array.from(toElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    cc: Array.from(ccElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    bcc: Array.from(bccElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    from: fromElement?.value || '',
    body: bodyText + '\n' + uetText,
  }
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

export function getDomainsInBody(body: string, domains: Set<string>): Set<string> {
  const domainsInBody = new Set<string>()
  const bodyLower = body.toLowerCase()
  
  domains.forEach(domain => {
    const emailDomainPattern = `@${domain.toLowerCase()}`
    if (bodyLower.includes(emailDomainPattern)) {
      domainsInBody.add(domain)
    }
  })
  
  return domainsInBody
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
  
  const externalDomains = getExternalDomains(allRecipients, companyDomains)
  
  if (externalDomains.size === 0) {
    return {
      level: 'safe',
      message: '社内のみ',
      detailMessage: 'すべて社内ドメインです'
    }
  }
  
  if (warningSettings.bodyCheckEnabled) {
    // 厳格モード: 本文チェックを行う
    const externalDomainsInBody = getDomainsInBody(emails.body, externalDomains)
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