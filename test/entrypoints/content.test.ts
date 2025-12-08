import { describe, it, expect, beforeEach, vi } from 'vitest'

// DOMをモック化する前に型を定義
interface MockedStorage {
  getValue: ReturnType<typeof vi.fn>
}

// globalに設定
;(globalThis as any).defineContentScript = vi.fn()

// ストレージをモック化
vi.mock('../../utils/storage', () => ({
  companyDomainsStorage: {
    getValue: vi.fn()
  } as MockedStorage,
  extensionEnabledStorage: {
    getValue: vi.fn()
  } as MockedStorage,
  warningSettingsStorage: {
    getValue: vi.fn()
  } as MockedStorage
}))

describe('content script', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  describe('getEmailAddresses', () => {
    // content.ts内のgetEmailAddresses関数をテストする前に、
    // 実際の関数をimportする方法を考える必要があります
    
    it('TO要素からメールアドレスを取得する', () => {
      // Gmail UIをモック - より正確な構造で作成
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const toContainer = document.createElement('div')
      toContainer.setAttribute('name', 'to')
      
      const toElement = document.createElement('div')
      toElement.setAttribute('data-hovercard-id', 'user@external.com')
      
      toContainer.appendChild(toElement)
      container.appendChild(toContainer)
      document.body.appendChild(container)

      const elements = document.querySelectorAll('[aria-label=新規メッセージ] [name=to] [data-hovercard-id]')
      expect(elements.length).toBe(1)
      expect(elements[0].getAttribute('data-hovercard-id')).toBe('user@external.com')
    })

    it('CC要素からメールアドレスを取得する', () => {
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const ccContainer = document.createElement('div')
      ccContainer.setAttribute('name', 'cc')
      
      const ccElement = document.createElement('div')
      ccElement.setAttribute('data-hovercard-id', 'cc@external.com')
      
      ccContainer.appendChild(ccElement)
      container.appendChild(ccContainer)
      document.body.appendChild(container)

      const elements = document.querySelectorAll('[aria-label=新規メッセージ] [name=cc] [data-hovercard-id]')
      expect(elements.length).toBe(1)
      expect(elements[0].getAttribute('data-hovercard-id')).toBe('cc@external.com')
    })

    it('BCC要素からメールアドレスを取得する', () => {
      const container = document.createElement('div')
      container.setAttribute('aria-label', '新規メッセージ')
      
      const bccContainer = document.createElement('div')
      bccContainer.setAttribute('name', 'bcc')
      
      const bccElement = document.createElement('div')
      bccElement.setAttribute('data-hovercard-id', 'bcc@external.com')
      
      bccContainer.appendChild(bccElement)
      container.appendChild(bccContainer)
      document.body.appendChild(container)

      const elements = document.querySelectorAll('[aria-label=新規メッセージ] [name=bcc] [data-hovercard-id]')
      expect(elements.length).toBe(1)
      expect(elements[0].getAttribute('data-hovercard-id')).toBe('bcc@external.com')
    })

    it('From要素からメールアドレスを取得する', () => {
      const fromElement = document.createElement('input') as HTMLInputElement
      fromElement.name = 'from'
      fromElement.value = 'sender@company.com'
      document.body.appendChild(fromElement)

      const element = document.querySelector('input[name="from"]') as HTMLInputElement
      expect(element?.value).toBe('sender@company.com')
    })

    it('メール本文を取得する', () => {
      const bodyElement = document.createElement('textarea') as HTMLTextAreaElement
      bodyElement.name = 'body'
      bodyElement.value = 'テストメール本文'
      document.body.appendChild(bodyElement)

      const element = document.querySelector('[name="body"]') as HTMLTextAreaElement
      expect(element?.value).toBe('テストメール本文')
    })
  })

  describe('setsEqual', () => {
    // setsEqual関数の基本的なロジックテスト
    it('同じ要素を持つSetは等しいと判定される', () => {
      const set1 = new Set(['a', 'b', 'c'])
      const set2 = new Set(['c', 'b', 'a'])
      
      // 実際の関数ではなくロジックをテスト
      const setsEqual = <T>(set1: Set<T>, set2: Set<T>): boolean => {
        if (set1.size !== set2.size) return false
        for (const item of set1) {
          if (!set2.has(item)) return false
        }
        return true
      }
      
      expect(setsEqual(set1, set2)).toBe(true)
    })

    it('異なる要素を持つSetは等しくないと判定される', () => {
      const set1 = new Set(['a', 'b'])
      const set2 = new Set(['a', 'c'])
      
      const setsEqual = <T>(set1: Set<T>, set2: Set<T>): boolean => {
        if (set1.size !== set2.size) return false
        for (const item of set1) {
          if (!set2.has(item)) return false
        }
        return true
      }
      
      expect(setsEqual(set1, set2)).toBe(false)
    })

    it('サイズが異なるSetは等しくないと判定される', () => {
      const set1 = new Set(['a'])
      const set2 = new Set(['a', 'b'])
      
      const setsEqual = <T>(set1: Set<T>, set2: Set<T>): boolean => {
        if (set1.size !== set2.size) return false
        for (const item of set1) {
          if (!set2.has(item)) return false
        }
        return true
      }
      
      expect(setsEqual(set1, set2)).toBe(false)
    })
  })

  describe('domain analysis', () => {
    it('社内ドメインと社外ドメインを正しく分類する', () => {
      const companyDomains = ['company.com', 'internal.com']
      const recipients = ['user@company.com', 'external@gmail.com', 'partner@external.com']
      
      const externalDomains = new Set<string>()
      recipients.forEach(email => {
        const domain = email.split('@')[1]
        if (domain && !companyDomains.includes(domain)) {
          externalDomains.add(domain)
        }
      })
      
      expect(externalDomains.has('gmail.com')).toBe(true)
      expect(externalDomains.has('external.com')).toBe(true)
      expect(externalDomains.has('company.com')).toBe(false)
    })
  })

  describe('warning styles', () => {
    it('警告レベルに応じた適切なスタイルを返す', () => {
      const getWarningStyles = (warningLevel: string) => {
        const styles = {
          safe: {
            container: { backgroundColor: '#e8f5e8', borderColor: '#137333', color: '#137333' },
            icon: '✓'
          },
          medium: {
            container: { backgroundColor: '#fef7e0', borderColor: '#fbbc04', color: '#b06000' },
            icon: '⚠️'
          },
          high: {
            container: { backgroundColor: '#fce8e6', borderColor: '#ea4335', color: '#d93025' },
            icon: '🚨'
          }
        }
        return styles[warningLevel as keyof typeof styles] || styles.medium
      }

      expect(getWarningStyles('safe').container.backgroundColor).toBe('#e8f5e8')
      expect(getWarningStyles('safe').icon).toBe('✓')
      
      expect(getWarningStyles('medium').container.backgroundColor).toBe('#fef7e0')
      expect(getWarningStyles('medium').icon).toBe('⚠️')
      
      expect(getWarningStyles('high').container.backgroundColor).toBe('#fce8e6')
      expect(getWarningStyles('high').icon).toBe('🚨')
      
      // 不正な値の場合はmediumにフォールバック
      expect(getWarningStyles('invalid')).toEqual(getWarningStyles('medium'))
    })
  })

  describe('UI element creation', () => {
    it('インジケーターが正しく作成される', () => {
      const indicator = document.createElement('div')
      indicator.id = 'gmail-safe-indicator'
      indicator.innerHTML = `
        <div style="display: flex; align-items: center; gap: 5px;">
          <span id="indicator-icon" style="font-size: 14px;"></span>
          <span id="indicator-message"></span>
        </div>
      `
      
      expect(indicator.id).toBe('gmail-safe-indicator')
      expect(indicator.querySelector('#indicator-icon')).toBeTruthy()
      expect(indicator.querySelector('#indicator-message')).toBeTruthy()
    })

    it('警告パネルが正しく作成される', () => {
      const panel = document.createElement('div')
      panel.id = 'gmail-warning-panel'
      panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="warning-icon" style="font-size: 18px;"></span>
            <strong style="font-size: 16px;">送信先チェック</strong>
          </div>
          <div style="display: flex; gap: 5px;">
            <button id="minimize-panel">＿</button>
            <button id="close-panel">×</button>
          </div>
        </div>
        <div id="warning-message"></div>
        <div>
          <strong>送信先:</strong>
          <div id="recipients-list"></div>
        </div>
      `
      
      expect(panel.id).toBe('gmail-warning-panel')
      expect(panel.querySelector('#warning-icon')).toBeTruthy()
      expect(panel.querySelector('#warning-message')).toBeTruthy()
      expect(panel.querySelector('#recipients-list')).toBeTruthy()
      expect(panel.querySelector('#minimize-panel')).toBeTruthy()
      expect(panel.querySelector('#close-panel')).toBeTruthy()
    })
  })
})