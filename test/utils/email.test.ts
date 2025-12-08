import { describe, it, expect, beforeEach } from 'vitest'
import {
  extractDomainFromEmail,
  getExternalDomains,
  getDomainsInBody,
  analyzeEmailSecurity,
  setsEqual,
  getEmailAddresses,
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
    it('本文に含まれるドメインを検出する（@形式）', () => {
      const body = 'こんにちは、@example.comと@test.orgにご連絡ください。'
      const domains = new Set(['example.com', 'test.org', 'notfound.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.has('test.org')).toBe(true)
      expect(result.has('notfound.com')).toBe(false)
      expect(result.size).toBe(2)
    })

    it('URL形式のドメインを検出する', () => {
      const body = 'サイト: https://example.com と www.test.org を参照してください。'
      const domains = new Set(['example.com', 'test.org'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.has('test.org')).toBe(true)
      expect(result.size).toBe(2)
    })

    it('大文字小文字を区別しない', () => {
      const body = 'Contact @EXAMPLE.COM for more info'
      const domains = new Set(['example.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.size).toBe(1)
    })

    it('類似ドメインによる誤検出を防ぐ', () => {
      const body = 'testing@test.com.example と @testcom について記載'
      const domains = new Set(['test.com'])
      
      const result = getDomainsInBody(body, domains)
      
      // test.com.exampleやtestcomは test.com とは異なるので検出されない
      expect(result.has('test.com')).toBe(false)
      expect(result.size).toBe(0)
    })

    it('正確なドメイン境界での検出', () => {
      const body = 'メール: user@example.com と https://example.com/page'
      const domains = new Set(['example.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.size).toBe(1)
    })

    it('サブドメインとの区別', () => {
      const body = 'サブドメイン: @sub.example.com とメイン: @example.com'
      const domains = new Set(['example.com'])
      
      const result = getDomainsInBody(body, domains)
      
      // sub.example.com は example.com とは異なる
      expect(result.has('example.com')).toBe(true)
      expect(result.size).toBe(1)
    })

    it('複数のURL形式での検出', () => {
      const body = `
        Website: https://domain1.com
        FTP: ftp://domain2.org
        Reference: www.domain3.net
        Email: contact@domain4.co.jp
      `
      const domains = new Set(['domain1.com', 'domain2.org', 'domain3.net', 'domain4.co.jp'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('domain1.com')).toBe(true)
      expect(result.has('domain2.org')).toBe(true) 
      expect(result.has('domain3.net')).toBe(true)
      expect(result.has('domain4.co.jp')).toBe(true)
      expect(result.size).toBe(4)
    })

    it('単純なドメイン記載での検出', () => {
      const body = '今回は example.com と test.org について説明します。'
      const domains = new Set(['example.com', 'test.org', 'notfound.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.has('test.org')).toBe(true)
      expect(result.has('notfound.com')).toBe(false)
      expect(result.size).toBe(2)
    })

    it('複数の記載形式が混在する場合', () => {
      const body = `
        連絡先は @contact.example.com です。
        詳細は https://info.example.com をご確認ください。
        また、support.example.com でもサポートしています。
      `
      const domains = new Set(['example.com', 'contact.example.com', 'info.example.com', 'support.example.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('contact.example.com')).toBe(true) // @形式
      expect(result.has('info.example.com')).toBe(true)    // URL形式  
      expect(result.has('support.example.com')).toBe(true) // 単純記載
      expect(result.has('example.com')).toBe(false) // 上記の一部として含まれているが、単独では記載なし
      expect(result.size).toBe(3)
    })

    it('境界文字での正確な検出', () => {
      const body = '会社: mycompany.example.com、クライアント: example.com、参考: not-example.com-site'
      const domains = new Set(['example.com'])
      
      const result = getDomainsInBody(body, domains)
      
      // example.com が単独で記載されている箇所のみ検出
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

    it('改行やタブを含む本文での検出', () => {
      const body = `お疲れ様です。
      
連絡先：
  メール：@example.com
  サイト：https://example.com
      
よろしくお願いします。`
      const domains = new Set(['example.com'])
      
      const result = getDomainsInBody(body, domains)
      
      expect(result.has('example.com')).toBe(true)
      expect(result.size).toBe(1)
    })

    it('社内ドメインは本文チェック対象から除外される', () => {
      const body = 'example.com と company.com について相談があります。'
      const domains = new Set(['example.com', 'company.com'])
      const companyDomains = ['company.com']
      
      const result = getDomainsInBody(body, domains, companyDomains)
      
      expect(result.has('example.com')).toBe(true)  // 外部ドメインは検出
      expect(result.has('company.com')).toBe(false) // 社内ドメインは除外
    })

    it('社内ドメインが複数ある場合も正しく除外される', () => {
      const body = '@external.com と @company.com と @internal.org について'
      const domains = new Set(['external.com', 'company.com', 'internal.org', 'other.com'])
      const companyDomains = ['company.com', 'internal.org']
      
      const result = getDomainsInBody(body, domains, companyDomains)
      
      expect(result.has('external.com')).toBe(true)   // 外部ドメインは検出
      expect(result.has('company.com')).toBe(false)   // 社内ドメインは除外
      expect(result.has('internal.org')).toBe(false)  // 社内ドメインは除外
      expect(result.has('other.com')).toBe(false)     // 本文にないので検出されない
    })
  })

  describe('isValidEmail (internal function testing)', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    // isValidEmailは内部関数ですが、getEmailAddressesを通してテストします
    it('有効なメールアドレスのみを抽出する', () => {
      // 有効・無効なメールアドレスが混在するDOM構造を作成
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const toContainer = document.createElement('div')
      toContainer.setAttribute('name', 'to')
      
      // 有効なメールアドレス
      const validEmail1 = document.createElement('div')
      validEmail1.setAttribute('data-hovercard-id', 'valid@example.com')
      
      // 無効なメールアドレス
      const invalidEmail1 = document.createElement('div')
      invalidEmail1.setAttribute('data-hovercard-id', 'invalid-email')
      
      const invalidEmail2 = document.createElement('div')
      invalidEmail2.setAttribute('data-hovercard-id', '@domain.com')
      
      // 有効なメールアドレス
      const validEmail2 = document.createElement('div')
      validEmail2.setAttribute('data-hovercard-id', 'test.user@domain.co.jp')
      
      toContainer.appendChild(validEmail1)
      toContainer.appendChild(invalidEmail1)
      toContainer.appendChild(invalidEmail2)
      toContainer.appendChild(validEmail2)
      container.appendChild(toContainer)
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.to).toEqual(['valid@example.com', 'test.user@domain.co.jp'])
      expect(result.to).not.toContain('invalid-email')
      expect(result.to).not.toContain('@domain.com')
    })

    it('重複するメールアドレスを除去する', () => {
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const toContainer = document.createElement('div')
      toContainer.setAttribute('name', 'to')
      
      // 同じメールアドレスを複数追加
      const email1 = document.createElement('div')
      email1.setAttribute('data-hovercard-id', 'duplicate@example.com')
      
      const email2 = document.createElement('div')
      email2.setAttribute('data-hovercard-id', 'duplicate@example.com')
      
      const email3 = document.createElement('div')
      email3.setAttribute('data-hovercard-id', 'unique@example.com')
      
      toContainer.appendChild(email1)
      toContainer.appendChild(email2)
      toContainer.appendChild(email3)
      container.appendChild(toContainer)
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.to).toEqual(['duplicate@example.com', 'unique@example.com'])
      expect(result.to.length).toBe(2)
    })
  })

  describe('combineBodyText (internal function testing)', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    // getEmailAddressesを通してcombineBodyTextの動作をテストします
    it('bodyとuetの組み合わせパターン', () => {
      // この機能は統合テストファイルで詳細にテストされているため、
      // ここでは基本的なケースのみテスト
      
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const bodyElement = document.createElement('textarea')
      bodyElement.name = 'body'
      bodyElement.value = '  本文  ' // 前後に空白
      
      const uetElement = document.createElement('textarea')
      uetElement.name = 'uet'
      uetElement.value = '  UET  ' // 前後に空白
      
      container.appendChild(bodyElement)
      container.appendChild(uetElement)
      document.body.appendChild(container)
      
      const result = getEmailAddresses()
      
      expect(result.body).toBe('本文\nUET') // trimされて結合
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

    it('社内ドメインが設定されていない場合は設定を促す', () => {
      emailData.to = ['user@example.com']
      emailData.cc = []
      emailData.bcc = []
      emailData.body = 'テストメールです。'
      
      const emptyCompanyDomains: string[] = []
      
      const result = analyzeEmailSecurity(emailData, emptyCompanyDomains, warningSettings)
      
      expect(result.level).toBe('medium')
      expect(result.message).toBe('社内ドメイン未設定')
      expect(result.detailMessage).toContain('社内ドメインが設定されていません')
      expect(result.detailMessage).toContain('拡張機能のポップアップから設定してください')
    })
  })

  describe('multiple compose windows support', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('複数のメール作成画面がある場合、最前面のものを取得する', () => {
      // 最初のメール作成画面 (z-index: 1000)
      const firstCompose = document.createElement('div')
      firstCompose.setAttribute('aria-label', '新規メッセージ')
      firstCompose.style.zIndex = '1000'
      firstCompose.style.position = 'fixed'
      firstCompose.style.display = 'block'
      firstCompose.style.width = '500px'
      firstCompose.style.height = '400px'
      
      const firstToContainer = document.createElement('div')
      firstToContainer.setAttribute('name', 'to')
      const firstToElement = document.createElement('span')
      firstToElement.setAttribute('data-hovercard-id', 'first@example.com')
      firstToContainer.appendChild(firstToElement)
      firstCompose.appendChild(firstToContainer)

      // 2番目のメール作成画面 (z-index: 2000, 最前面)
      const secondCompose = document.createElement('div')
      secondCompose.setAttribute('aria-label', '新規メッセージ')
      secondCompose.style.zIndex = '2000'
      secondCompose.style.position = 'fixed'
      secondCompose.style.display = 'block'
      secondCompose.style.width = '500px'
      secondCompose.style.height = '400px'
      
      const secondToContainer = document.createElement('div')
      secondToContainer.setAttribute('name', 'to')
      const secondToElement = document.createElement('span')
      secondToElement.setAttribute('data-hovercard-id', 'second@example.com')
      secondToContainer.appendChild(secondToElement)
      secondCompose.appendChild(secondToContainer)

      document.body.appendChild(firstCompose)
      document.body.appendChild(secondCompose)
      
      const result = getEmailAddresses()
      
      // 最前面（z-index が高い）のメール作成画面の情報が取得されることを確認
      expect(result.to).toEqual(['second@example.com'])
      expect(result.to).not.toContain('first@example.com')
    })

    it('非表示のメール作成画面は無視される', () => {
      // 表示されているメール作成画面
      const visibleCompose = document.createElement('div')
      visibleCompose.setAttribute('aria-label', '新規メッセージ')
      visibleCompose.style.display = 'block'
      visibleCompose.style.width = '500px'
      visibleCompose.style.height = '400px'
      
      const visibleToContainer = document.createElement('div')
      visibleToContainer.setAttribute('name', 'to')
      const visibleToElement = document.createElement('span')
      visibleToElement.setAttribute('data-hovercard-id', 'visible@example.com')
      visibleToContainer.appendChild(visibleToElement)
      visibleCompose.appendChild(visibleToContainer)

      // 非表示のメール作成画面
      const hiddenCompose = document.createElement('div')
      hiddenCompose.setAttribute('aria-label', '新規メッセージ')
      hiddenCompose.style.display = 'none'
      
      const hiddenToContainer = document.createElement('div')
      hiddenToContainer.setAttribute('name', 'to')
      const hiddenToElement = document.createElement('span')
      hiddenToElement.setAttribute('data-hovercard-id', 'hidden@example.com')
      hiddenToContainer.appendChild(hiddenToElement)
      hiddenCompose.appendChild(hiddenToContainer)

      document.body.appendChild(visibleCompose)
      document.body.appendChild(hiddenCompose)
      
      const result = getEmailAddresses()
      
      // 表示されているメール作成画面の情報のみが取得されることを確認
      expect(result.to).toEqual(['visible@example.com'])
      expect(result.to).not.toContain('hidden@example.com')
    })

    it('メール作成画面が見つからない場合は空のデータを返す', () => {
      // メール作成に関連しない要素のみを配置
      const nonComposeElement = document.createElement('div')
      nonComposeElement.innerHTML = '<p>これはメール作成画面ではありません</p>'
      document.body.appendChild(nonComposeElement)
      
      const result = getEmailAddresses()
      
      expect(result).toEqual({
        to: [],
        cc: [],
        bcc: [],
        from: '',
        body: ''
      })
    })
  })
})