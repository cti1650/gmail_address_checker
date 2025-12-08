import { describe, it, expect, beforeEach } from 'vitest'
import {
  getWarningStyles,
  createIndicatorElement,
  createExpandedPanelElement,
  formatRecipientsList,
  updateElementStyle,
  setElementContent,
  setElementHTML,
  showElement,
  hideElement
} from '../../utils/ui'
import type { WarningLevel } from '../../utils/email'
import type { EmailData } from '../../utils/email'

describe('UI utilities', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('getWarningStyles', () => {
    it('safeレベルの正しいスタイルを返す', () => {
      const styles = getWarningStyles('safe')
      
      expect(styles.container.backgroundColor).toBe('#e8f5e8')
      expect(styles.container.borderColor).toBe('#137333')
      expect(styles.container.color).toBe('#137333')
      expect(styles.icon).toBe('✓')
    })

    it('mediumレベルの正しいスタイルを返す', () => {
      const styles = getWarningStyles('medium')
      
      expect(styles.container.backgroundColor).toBe('#fef7e0')
      expect(styles.container.borderColor).toBe('#fbbc04')
      expect(styles.container.color).toBe('#b06000')
      expect(styles.icon).toBe('⚠️')
    })

    it('highレベルの正しいスタイルを返す', () => {
      const styles = getWarningStyles('high')
      
      expect(styles.container.backgroundColor).toBe('#fce8e6')
      expect(styles.container.borderColor).toBe('#ea4335')
      expect(styles.container.color).toBe('#d93025')
      expect(styles.icon).toBe('🚨')
    })
  })

  describe('createIndicatorElement', () => {
    it('正しい構造のインジケーター要素を作成する', () => {
      const indicator = createIndicatorElement()
      
      expect(indicator.id).toBe('gmail-safe-indicator')
      expect(indicator.querySelector('#indicator-icon')).toBeTruthy()
      expect(indicator.querySelector('#indicator-message')).toBeTruthy()
      expect(indicator.style.position).toBe('fixed')
      expect(indicator.style.display).toBe('none')
    })

    it('インジケーター要素がbodyに追加される', () => {
      createIndicatorElement()
      
      const indicator = document.getElementById('gmail-safe-indicator')
      expect(indicator).toBeTruthy()
      expect(indicator?.parentElement).toBe(document.body)
    })

    it('ホバーイベントが正しく設定される', () => {
      const indicator = createIndicatorElement()
      indicator.style.cursor = 'pointer'
      
      // mouseenterイベントをシミュレート
      const mouseEnterEvent = new Event('mouseenter')
      indicator.dispatchEvent(mouseEnterEvent)
      
      expect(indicator.style.transform).toBe('scale(1.05)')
      
      // mouseleaveイベントをシミュレート
      const mouseLeaveEvent = new Event('mouseleave')
      indicator.dispatchEvent(mouseLeaveEvent)
      
      expect(indicator.style.transform).toBe('scale(1)')
    })
  })

  describe('createExpandedPanelElement', () => {
    it('正しい構造のパネル要素を作成する', () => {
      const panel = createExpandedPanelElement()
      
      expect(panel.id).toBe('gmail-warning-panel')
      expect(panel.querySelector('#warning-icon')).toBeTruthy()
      expect(panel.querySelector('#warning-message')).toBeTruthy()
      expect(panel.querySelector('#recipients-list')).toBeTruthy()
      expect(panel.querySelector('#minimize-panel')).toBeTruthy()
      expect(panel.querySelector('#close-panel')).toBeTruthy()
      expect(panel.style.position).toBe('fixed')
      expect(panel.style.display).toBe('none')
    })

    it('パネル要素がbodyに追加される', () => {
      createExpandedPanelElement()
      
      const panel = document.getElementById('gmail-warning-panel')
      expect(panel).toBeTruthy()
      expect(panel?.parentElement).toBe(document.body)
    })
  })

  describe('formatRecipientsList', () => {
    it('全ての受信者タイプを正しくフォーマットする', () => {
      const emailData: EmailData = {
        to: ['to1@example.com', 'to2@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        from: 'sender@example.com',
        body: 'test'
      }
      
      const result = formatRecipientsList(emailData)
      
      expect(result).toContain('TO: to1@example.com, to2@example.com')
      expect(result).toContain('CC: cc@example.com')
      expect(result).toContain('BCC: bcc@example.com')
      expect(result).toContain('<br>')
    })

    it('TOのみがある場合の正しいフォーマット', () => {
      const emailData: EmailData = {
        to: ['to@example.com'],
        cc: [],
        bcc: [],
        from: 'sender@example.com',
        body: 'test'
      }
      
      const result = formatRecipientsList(emailData)
      
      expect(result).toBe('TO: to@example.com')
      expect(result).not.toContain('CC:')
      expect(result).not.toContain('BCC:')
    })

    it('受信者がいない場合は"送信先なし"を返す', () => {
      const emailData: EmailData = {
        to: [],
        cc: [],
        bcc: [],
        from: 'sender@example.com',
        body: 'test'
      }
      
      const result = formatRecipientsList(emailData)
      
      expect(result).toBe('送信先なし')
    })
  })

  describe('updateElementStyle', () => {
    it('要素のスタイルを正しく更新する', () => {
      const element = document.createElement('div')
      const styles = {
        backgroundColor: 'red',
        color: 'white',
        fontSize: '14px'
      }
      
      updateElementStyle(element, styles)
      
      expect(element.style.backgroundColor).toBe('red')
      expect(element.style.color).toBe('white')
      expect(element.style.fontSize).toBe('14px')
    })

    it('複数のスタイルプロパティを同時に設定する', () => {
      const element = document.createElement('div')
      element.style.backgroundColor = 'blue' // 既存のスタイル
      
      const styles = {
        backgroundColor: 'red',
        border: '1px solid black'
      }
      
      updateElementStyle(element, styles)
      
      expect(element.style.backgroundColor).toBe('red') // 上書きされる
      expect(element.style.border).toBe('1px solid black') // 新規追加
    })
  })

  describe('setElementContent', () => {
    it('要素のテキストコンテンツを設定する', () => {
      const element = document.createElement('div')
      
      setElementContent(element, 'テストテキスト')
      
      expect(element.textContent).toBe('テストテキスト')
    })

    it('nullの要素に対してはエラーにならない', () => {
      expect(() => {
        setElementContent(null, 'テスト')
      }).not.toThrow()
    })

    it('HTMLタグはエスケープされる', () => {
      const element = document.createElement('div')
      
      setElementContent(element, '<strong>テスト</strong>')
      
      expect(element.textContent).toBe('<strong>テスト</strong>')
      expect(element.innerHTML).not.toContain('<strong>')
    })
  })

  describe('setElementHTML', () => {
    it('要素のHTMLコンテンツを設定する', () => {
      const element = document.createElement('div')
      
      setElementHTML(element, '<strong>テスト</strong>')
      
      expect(element.innerHTML).toBe('<strong>テスト</strong>')
      expect(element.textContent).toBe('テスト')
    })

    it('nullの要素に対してはエラーにならない', () => {
      expect(() => {
        setElementHTML(null, '<div>テスト</div>')
      }).not.toThrow()
    })

    it('複雑なHTMLも正しく設定される', () => {
      const element = document.createElement('div')
      const html = '<span class="test">Hello</span><br><em>World</em>'
      
      setElementHTML(element, html)
      
      expect(element.innerHTML).toBe(html)
      expect(element.querySelector('.test')).toBeTruthy()
      expect(element.querySelector('em')).toBeTruthy()
    })
  })

  describe('showElement', () => {
    it('要素を表示状態にする', () => {
      const element = document.createElement('div')
      element.style.display = 'none'
      
      showElement(element)
      
      expect(element.style.display).toBe('block')
    })

    it('nullの要素に対してはエラーにならない', () => {
      expect(() => {
        showElement(null)
      }).not.toThrow()
    })
  })

  describe('hideElement', () => {
    it('要素を非表示状態にする', () => {
      const element = document.createElement('div')
      element.style.display = 'block'
      
      hideElement(element)
      
      expect(element.style.display).toBe('none')
    })

    it('nullの要素に対してはエラーにならない', () => {
      expect(() => {
        hideElement(null)
      }).not.toThrow()
    })

    it('既に非表示の要素も正しく処理される', () => {
      const element = document.createElement('div')
      element.style.display = 'none'
      
      hideElement(element)
      
      expect(element.style.display).toBe('none')
    })
  })
})