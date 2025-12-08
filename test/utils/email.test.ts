import { describe, it, expect, beforeEach } from 'vitest'
import {
  extractDomainFromEmail,
  getExternalDomains,
  getDomainsInBody,
  analyzeEmailSecurity,
  setsEqual,
  type EmailData,
  type WarningSettings
} from '../../utils/email'

describe('email utilities', () => {
  describe('extractDomainFromEmail', () => {
    it('正常なメールアドレスからドメインを抽出する', () => {
      expect(extractDomainFromEmail('user@example.com')).toBe('example.com')
      expect(extractDomainFromEmail('test@gmail.com')).toBe('gmail.com')
      expect(extractDomainFromEmail('admin@company.co.jp')).toBe('company.co.jp')
    })

    it('不正なメールアドレスでは空文字を返す', () => {
      expect(extractDomainFromEmail('invalid-email')).toBe('')
      expect(extractDomainFromEmail('')).toBe('')
      expect(extractDomainFromEmail('@')).toBe('')
      expect(extractDomainFromEmail('@domain.com')).toBe('domain.com')
    })

    it('複数の@が含まれる場合は最初の@で分割した2番目の要素を取得', () => {
      // split('@')[1]の動作: 'user@domain@example.com'.split('@') => ['user', 'domain', 'example.com']
      // そのうちの[1]なので 'domain' が返される
      expect(extractDomainFromEmail('user@domain@example.com')).toBe('domain')
    })
  })

  describe('getExternalDomains', () => {
    const companyDomains = ['company.com', 'internal.org']

    it('社外ドメインのみを抽出する', () => {
      const recipients = [
        'user@company.com',
        'external@gmail.com',
        'partner@external.org',
        'internal@internal.org'
      ]
      
      const result = getExternalDomains(recipients, companyDomains)
      
      expect(result.has('gmail.com')).toBe(true)
      expect(result.has('external.org')).toBe(true)
      expect(result.has('company.com')).toBe(false)
      expect(result.has('internal.org')).toBe(false)
      expect(result.size).toBe(2)
    })

    it('すべて社内ドメインの場合は空のSetを返す', () => {
      const recipients = [
        'user1@company.com',
        'user2@internal.org'
      ]
      
      const result = getExternalDomains(recipients, companyDomains)
      
      expect(result.size).toBe(0)
    })

    it('空の受信者リストでは空のSetを返す', () => {
      const result = getExternalDomains([], companyDomains)
      expect(result.size).toBe(0)
    })

    it('重複する外部ドメインは1つにまとめる', () => {
      const recipients = [
        'user1@gmail.com',
        'user2@gmail.com',
        'user3@external.com'
      ]
      
      const result = getExternalDomains(recipients, companyDomains)
      
      expect(result.has('gmail.com')).toBe(true)
      expect(result.has('external.com')).toBe(true)
      expect(result.size).toBe(2)
    })
  })

  describe('getDomainsInBody', () => {
    it('本文に含まれるドメインを検出する', () => {
      const body = 'こんにちは、@example.comと@test.orgにご連絡ください。'
      const domains = new Set(['example.com', 'test.org', 'notfound.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.has('test.org')).toBe(true)
      expect(result.has('notfound.com')).toBe(false)
      expect(result.size).toBe(2)
    })

    it('大文字小文字を区別しない', () => {
      const body = 'Contact @EXAMPLE.COM for more info'
      const domains = new Set(['example.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.size).toBe(1)
    })

    it('本文に該当ドメインがない場合は空のSetを返す', () => {
      const body = 'これは普通のテキストです。'
      const domains = new Set(['example.com', 'test.org'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.size).toBe(0)
    })

    it('空のドメインセットでは空のSetを返す', () => {
      const body = '連絡先: @example.com'
      const domains = new Set<string>()
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.size).toBe(0)
    })
  })

  describe('setsEqual', () => {
    it('同じ要素を持つSetは等しいと判定される', () => {
      const set1 = new Set(['a', 'b', 'c'])
      const set2 = new Set(['c', 'b', 'a']) // 順序は関係ない
      
      expect(setsEqual(set1, set2)).toBe(true)
    })

    it('異なる要素を持つSetは等しくないと判定される', () => {
      const set1 = new Set(['a', 'b'])
      const set2 = new Set(['a', 'c'])
      
      expect(setsEqual(set1, set2)).toBe(false)
    })

    it('サイズが異なるSetは等しくないと判定される', () => {
      const set1 = new Set(['a'])
      const set2 = new Set(['a', 'b'])
      
      expect(setsEqual(set1, set2)).toBe(false)
    })

    it('空のSetは等しいと判定される', () => {
      const set1 = new Set()
      const set2 = new Set()
      
      expect(setsEqual(set1, set2)).toBe(true)
    })
  })

  describe('analyzeEmailSecurity', () => {
    let emailData: EmailData
    let companyDomains: string[]
    let warningSettings: WarningSettings

    beforeEach(() => {
      emailData = {
        to: ['user@company.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'テストメールです。'
      }
      
      companyDomains = ['company.com', 'internal.org']
      
      warningSettings = {
        warningLevel: 'strict',
        bodyCheckEnabled: true
      }
    })

    it('送信先がない場合はsafeレベルを返す', () => {
      emailData.to = []
      emailData.cc = []
      emailData.bcc = []
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('safe')
      expect(result.message).toBe('送信先なし')
    })

    it('チェックが無効の場合はsafeレベルを返す', () => {
      warningSettings.warningLevel = 'off'
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('safe')
      expect(result.message).toBe('チェック無効')
    })

    it('すべて社内ドメインの場合はsafeレベルを返す', () => {
      emailData.to = ['user1@company.com', 'user2@internal.org']
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('safe')
      expect(result.message).toBe('社内のみ')
    })

    it('社外ドメインがあり本文チェック無効の場合はmediumレベルを返す', () => {
      emailData.to = ['external@gmail.com']
      warningSettings.bodyCheckEnabled = false
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium')
      expect(result.message).toBe('社外ドメイン 1件')
      expect(result.detailMessage).toContain('gmail.com')
    })

    it('社外ドメインがあり本文に記載済みの場合はmediumレベルを返す', () => {
      emailData.to = ['external@gmail.com']
      emailData.body = 'お疲れ様です。@gmail.comにご連絡ください。'
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium')
      expect(result.message).toBe('社外ドメイン 1件')
      expect(result.detailMessage).toContain('本文に記載済み')
      expect(result.detailMessage).toContain('gmail.com')
    })

    it('社外ドメインがあり本文に記載がない場合はhighレベルを返す', () => {
      emailData.to = ['external@gmail.com']
      emailData.body = 'お疲れ様です。よろしくお願いします。'
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('high')
      expect(result.message).toBe('社外ドメイン 1件')
      expect(result.detailMessage).toContain('本文に記載のない')
      expect(result.detailMessage).toContain('gmail.com')
    })

    it('複数の社外ドメインで一部本文に記載がない場合はhighレベルを返す', () => {
      emailData.to = ['user1@gmail.com', 'user2@yahoo.com']
      emailData.body = 'お疲れ様です。@gmail.comにご連絡ください。'
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('high')
      expect(result.message).toBe('社外ドメイン 2件')
      expect(result.detailMessage).toContain('yahoo.com')
      expect(result.detailMessage).not.toContain('gmail.com') // gmail.comは本文に記載済みなので除外
    })

    it('TO, CC, BCCすべてから社外ドメインを検出する', () => {
      emailData.to = ['to@gmail.com']
      emailData.cc = ['cc@yahoo.com']
      emailData.bcc = ['bcc@hotmail.com']
      emailData.body = 'テストメールです。'
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('high')
      expect(result.message).toBe('社外ドメイン 3件')
    })
  })
})