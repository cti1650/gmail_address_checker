import type { EmailData, WarningLevel } from './email'

export interface WarningStyles {
  container: Record<string, string>
  icon: string
}

export function getWarningStyles(warningLevel: WarningLevel): WarningStyles {
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
  } as const
  return styles[warningLevel] || styles.medium
}

export function createIndicatorElement(): HTMLElement {
  const indicator = document.createElement('div')
  indicator.id = 'gmail-safe-indicator'
  
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    border: 1px solid;
    border-radius: 20px;
    padding: 8px 12px;
    font-family: 'Roboto', Arial, sans-serif;
    font-size: 12px;
    z-index: 9998;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    display: none;
    user-select: none;
    transition: all 0.2s ease;
  `
  
  indicator.innerHTML = `
    <div style="display: flex; align-items: center; gap: 5px;">
      <span id="indicator-icon" style="font-size: 14px;"></span>
      <span id="indicator-message"></span>
    </div>
  `
  
  // ホバー効果
  indicator.addEventListener('mouseenter', () => {
    if (indicator.style.cursor === 'pointer') {
      indicator.style.transform = 'scale(1.05)'
      indicator.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'
    }
  })
  
  indicator.addEventListener('mouseleave', () => {
    indicator.style.transform = 'scale(1)'
    indicator.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
  })
  
  document.body.appendChild(indicator)
  return indicator
}

export function createExpandedPanelElement(): HTMLElement {
  const panel = document.createElement('div')
  panel.id = 'gmail-warning-panel'
  
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 350px;
    min-height: 120px;
    padding: 15px;
    border: 2px solid;
    border-radius: 8px;
    font-family: 'Roboto', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    z-index: 9999;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    display: none;
  `
  
  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span id="warning-icon" style="font-size: 18px;"></span>
        <strong style="font-size: 16px;">送信先チェック</strong>
      </div>
      <div style="display: flex; gap: 5px;">
        <button id="minimize-panel" style="background: transparent; border: none; font-size: 14px; cursor: pointer; color: inherit; padding: 2px 5px;">＿</button>
        <button id="close-panel" style="background: transparent; border: none; font-size: 16px; cursor: pointer; color: inherit; padding: 2px 5px;">×</button>
      </div>
    </div>
    <div id="warning-message" style="margin-bottom: 10px; font-weight: 500;"></div>
    <div style="font-size: 12px;">
      <strong>送信先:</strong>
      <div id="recipients-list" style="margin-top: 5px; font-family: monospace;"></div>
    </div>
  `
  
  document.body.appendChild(panel)
  return panel
}

export function formatRecipientsList(emails: EmailData): string {
  const recipientsList = []
  if (emails.to.length > 0) recipientsList.push(`TO: ${emails.to.join(', ')}`)
  if (emails.cc.length > 0) recipientsList.push(`CC: ${emails.cc.join(', ')}`)
  if (emails.bcc.length > 0) recipientsList.push(`BCC: ${emails.bcc.join(', ')}`)
  return recipientsList.join('<br>') || '送信先なし'
}

export function updateElementStyle(element: HTMLElement, styles: Record<string, string>): void {
  Object.assign(element.style, styles)
}

export function setElementContent(element: HTMLElement | null, content: string): void {
  if (element) {
    element.textContent = content
  }
}

export function setElementHTML(element: HTMLElement | null, html: string): void {
  if (element) {
    element.innerHTML = html
  }
}

export function showElement(element: HTMLElement | null): void {
  if (element) {
    element.style.display = 'block'
  }
}

export function hideElement(element: HTMLElement | null): void {
  if (element) {
    element.style.display = 'none'
  }
}