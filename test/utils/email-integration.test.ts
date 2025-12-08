import { describe, it, expect, beforeEach } from 'vitest'
import { getEmailAddresses, analyzeEmailSecurity } from '../../utils/email'

describe('email integration tests', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('getEmailAddresses with body and UET fields', () => {
    it('bodyとuetフィールドが正しく結合される', () => {
      // Gmail UI構造をモック
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      // TO要素
      const toContainer = document.createElement('div')
      toContainer.setAttribute('name', 'to')
      const toElement = document.createElement('div')
      toElement.setAttribute('data-hovercard-id', 'external@gmail.com')
      toContainer.appendChild(toElement)
      container.appendChild(toContainer)
      
      // From要素
      const fromElement = document.createElement('input') as HTMLInputElement
      fromElement.name = 'from'
      fromElement.value = 'sender@company.com'
      container.appendChild(fromElement)
      
      // Body要素
      const bodyElement = document.createElement('textarea') as HTMLTextAreaElement
      bodyElement.name = 'body'
      bodyElement.value = 'メール本文です。'
      container.appendChild(bodyElement)
      
      // UET要素
      const uetElement = document.createElement('textarea') as HTMLTextAreaElement
      uetElement.name = 'uet'
      uetElement.value = '@gmail.com に送信します。'
      container.appendChild(uetElement)
      
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.to).toEqual(['external@gmail.com'])
      expect(result.from).toBe('sender@company.com')
      expect(result.body).toBe('メール本文です。\n@gmail.com に送信します。')
    })

    it('bodyのみでuetが空の場合', () => {
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const bodyElement = document.createElement('textarea')
      bodyElement.name = 'body'
      bodyElement.value = 'テスト本文'
      
      const uetElement = document.createElement('textarea')
      uetElement.name = 'uet'
      uetElement.value = ''
      
      container.appendChild(bodyElement)
      container.appendChild(uetElement)
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.body).toBe('テスト本文')
    })

    it('uetのみでbodyが空の場合', () => {
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const bodyElement = document.createElement('textarea')
      bodyElement.name = 'body'
      bodyElement.value = ''
      
      const uetElement = document.createElement('textarea')
      uetElement.name = 'uet'
      uetElement.value = 'UETテキスト'
      
      container.appendChild(bodyElement)
      container.appendChild(uetElement)
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.body).toBe('UETテキスト')
    })

    it('bodyとuetが両方空の場合', () => {
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.body).toBe('') // 両方空なら空文字
    })

    it('bodyとuet要素が存在しない場合', () => {
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.body).toBe('')
    })
  })

  describe('analyzeEmailSecurity with body/UET integration', () => {
    it('UETフィールドにドメインが記載されている場合の警告レベル判定', () => {
      const emailData = {
        to: ['external@gmail.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'お疲れ様です。\n@gmail.com に送信予定です。' // UETがbodyに結合される
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // 本文（UET含む）にドメインが記載されているので medium
      expect(result.detailMessage).toContain('本文に記載済み')
      expect(result.detailMessage).toContain('gmail.com')
    })

    it('bodyにはないがUETにのみドメインが記載されている場合', () => {
      const emailData = {
        to: ['external@yahoo.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'お疲れ様です。\nContacting @yahoo.com today.' // UET部分にドメインあり
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // UET部分も含めて本文チェックするので medium
      expect(result.detailMessage).toContain('本文に記載済み')
    })

    it('bodyにもUETにもドメインが記載されていない場合', () => {
      const emailData = {
        to: ['external@outlook.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'お疲れ様です。\n明日打ち合わせです。' // outlook.comの記載なし
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('high') // ドメインが本文に記載されていないので high
      expect(result.detailMessage).toContain('本文に記載のない')
      expect(result.detailMessage).toContain('outlook.com')
    })

    it('複数の社外ドメインで部分的にしか記載されていない場合', () => {
      const emailData = {
        to: ['user@gmail.com', 'user@yahoo.com', 'user@hotmail.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'お疲れ様です。@gmail.comと@yahoo.comについて\n連絡します。' // hotmail.comの記載なし
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('high') // hotmail.comが記載されていないので high
      expect(result.detailMessage).toContain('本文に記載のない')
      expect(result.detailMessage).toContain('hotmail.com')
      expect(result.detailMessage).not.toContain('gmail.com') // 記載済みは除外
      expect(result.detailMessage).not.toContain('yahoo.com') // 記載済みは除外
    })

    it('bodyCheckEnabledがfalseの場合は本文チェックをスキップ', () => {
      const emailData = {
        to: ['external@gmail.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'ドメインの記載なし'
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: false // 本文チェック無効
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // bodyCheckEnabledがfalseなので medium
      expect(result.detailMessage).toContain('社外ドメイン')
      expect(result.detailMessage).toContain('gmail.com')
      expect(result.detailMessage).not.toContain('本文に記載') // 本文チェックしていない
    })
  })

  describe('edge cases and special characters', () => {
    it('日本語と英語が混在した本文での正確なドメイン検出', () => {
      const emailData = {
        to: ['user@example.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'こんにちは。Please contact @example.com for details.\n詳細については@example.comまでご連絡ください。'
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium')
      expect(result.detailMessage).toContain('本文に記載済み')
    })

    it('社内ドメインが本文にあっても本文チェックから除外される', () => {
      const emailData = {
        to: ['user@external.com', 'colleague@company.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: '詳細については@external.comと@company.comまでご連絡ください。'
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // external.comが本文に記載済みなので medium
      expect(result.detailMessage).toContain('本文に記載済み')
      expect(result.detailMessage).toContain('external.com')
      expect(result.detailMessage).not.toContain('company.com') // 社内ドメインは言及されない
    })

    it('URLやメールアドレス形式でのドメイン検出', () => {
      const emailData = {
        to: ['contact@testdomain.org'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'サイト: https://testdomain.org\nメール: info@testdomain.org'
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // @testdomain.orgが含まれているので
    })

    it('類似ドメインによる誤検出を防ぐ', () => {
      const emailData = {
        to: ['user@test.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'testing@test.com.example や @testcom について' // test.comと異なる
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('high') // @test.comの記載がないので high
      expect(result.detailMessage).toContain('本文に記載のない')
    })

    it('単純なドメイン記載での正しい検出', () => {
      const emailData = {
        to: ['contact@example.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: 'This email is regarding example.com domain management.' // @やURLなしの単純記載
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // example.comが本文に記載されているので medium
      expect(result.detailMessage).toContain('本文に記載済み')
      expect(result.detailMessage).toContain('example.com')
    })

    it('日本語文章での単純なドメイン記載', () => {
      const emailData = {
        to: ['support@example.com'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: '今回は example.com の件についてご相談があります。よろしくお願いします。'
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // example.comが本文に記載されているので medium
      expect(result.detailMessage).toContain('本文に記載済み')
    })

    it('複数の記載形式が混在する実際のケース', () => {
      const emailData = {
        to: ['admin@example.com', 'support@testdomain.org'],
        cc: [],
        bcc: [],
        from: 'sender@company.com',
        body: `
          お疲れ様です。

          example.com について以下の通り対応いたします：
          - 管理者へ連絡: admin@example.com
          - サポートサイト: https://testdomain.org

          よろしくお願いします。
        `
      }
      
      const companyDomains = ['company.com']
      const warningSettings = {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true
      }
      
      const result = analyzeEmailSecurity(emailData, companyDomains, warningSettings)
      
      expect(result.level).toBe('medium') // 両方とも本文に記載されているので medium
      expect(result.detailMessage).toContain('本文に記載済み')
    })
  })
})