import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { companyDomainsStorage, extensionEnabledStorage, warningSettingsStorage } from '../utils/storage'
import { getEmailAddresses, analyzeEmailSecurity, setsEqual, getExternalDomains, type EmailData } from '../utils/email'
import {
  getWarningStyles,
  createIndicatorElement,
  createExpandedPanelElement,
  formatRecipientsList,
  updateElementStyle,
  setElementContent,
  setElementHTML,
  showElement,
  hideElement,
} from '../utils/ui'

// 統一状態管理
interface UIState {
  lastWarningState: string
  lastWarningLevel: string
  autoHideTimeout: number | null
  lastIndicatorMessage: string
  lastDetailMessage: string
  lastEmails: EmailData | null
  isTemporarilySuppressed: boolean
  suppressTimeout: number | null
  suppressedWarningLevel: string
  suppressedDomains: Set<string>
}

const uiState: UIState = {
  lastWarningState: '',
  lastWarningLevel: '',
  autoHideTimeout: null,
  lastIndicatorMessage: '',
  lastDetailMessage: '',
  lastEmails: null,
  isTemporarilySuppressed: false,
  suppressTimeout: null,
  suppressedWarningLevel: '',
  suppressedDomains: new Set(),
}

// ctx 経由 setTimeout (context 無効化時に自動 cleanup)
let activeCtx: ContentScriptContext | null = null

// 初期化: ctx を保持し scan を返す
export function setupSendCheck(ctx: ContentScriptContext): { scan: () => void } {
  activeCtx = ctx
  ctx.onInvalidated(() => {
    activeCtx = null
  })
  return { scan: scanCompose }
}

// ctx.setTimeout は this バインドが必要なので、メソッド呼び出しを保つラッパー経由で
function scheduleTimeout(handler: () => void, ms: number): number {
  return activeCtx ? activeCtx.setTimeout(handler, ms) : window.setTimeout(handler, ms)
}

function scanCompose(): void {
  try {
    const emails = getEmailAddresses()
    void analyzeAndShowRealtimeWarning(emails)
  } catch (error) {
    console.log('メールアドレス取得エラー:', error)
  }
}

async function analyzeAndShowRealtimeWarning(emails: EmailData): Promise<void> {
  try {
    const extensionEnabled = await extensionEnabledStorage.getValue()
    if (!extensionEnabled) {
      hideRealtimeWarning()
      return
    }

    const allRecipients = [...emails.to, ...emails.cc, ...emails.bcc].filter(Boolean)
    if (allRecipients.length === 0) {
      hideRealtimeWarning()
      return
    }

    const companyDomains = await companyDomainsStorage.getValue()
    const warningSettings = await warningSettingsStorage.getValue()

    const result = analyzeEmailSecurity(emails, companyDomains, warningSettings)

    await showRealtimeWarning(result.message, emails, result.level, result.detailMessage)
  } catch (error) {
    hideRealtimeWarning()
  }
}

async function showRealtimeWarning(
  indicatorMessage: string,
  emails: EmailData,
  warningLevel: string = 'medium',
  detailMessage?: string
): Promise<void> {
  let forceShow = false

  // 抑制チェック
  if (uiState.isTemporarilySuppressed) {
    const levelChanged = warningLevel !== uiState.suppressedWarningLevel
    const currentExternalDomains = await getCurrentExternalDomains(emails)
    const domainsChanged = !setsEqual(currentExternalDomains, uiState.suppressedDomains)

    if (levelChanged || domainsChanged) {
      clearSuppression()
      forceShow = true
    } else {
      return
    }
  }

  // 重複チェック（本文の内容も含める）
  const currentState = `${warningLevel}:${indicatorMessage}:${detailMessage}`
  if (!forceShow && currentState === uiState.lastWarningState) {
    return
  }
  uiState.lastWarningState = currentState

  // 状態を保存
  uiState.lastWarningLevel = warningLevel
  uiState.lastIndicatorMessage = indicatorMessage
  uiState.lastDetailMessage = detailMessage || indicatorMessage
  uiState.lastEmails = emails

  // タイムアウトクリア
  if (uiState.autoHideTimeout) {
    clearTimeout(uiState.autoHideTimeout)
    uiState.autoHideTimeout = null
  }

  // UI表示制御
  if (warningLevel === 'safe') {
    showIndicator(indicatorMessage, warningLevel, emails, detailMessage)
    hideExpandedPanel()
    uiState.autoHideTimeout = scheduleTimeout(() => {
      hideIndicator()
      uiState.autoHideTimeout = null
    }, 10000)
  } else if (warningLevel === 'medium') {
    showIndicator(indicatorMessage, warningLevel, emails, detailMessage)
    hideExpandedPanel()
  } else {
    hideIndicator()
    showExpandedPanel(detailMessage || indicatorMessage, emails, warningLevel)
  }
}

function hideRealtimeWarning(): void {
  hideIndicator()
  hideExpandedPanel()
  uiState.lastWarningState = ''
}

async function temporarilySuppressWarning(): Promise<void> {
  uiState.suppressedWarningLevel = uiState.lastWarningLevel
  uiState.suppressedDomains = uiState.lastEmails
    ? await getCurrentExternalDomains(uiState.lastEmails)
    : new Set()
  uiState.isTemporarilySuppressed = true
  hideIndicator()
  hideExpandedPanel()

  if (uiState.suppressTimeout) {
    clearTimeout(uiState.suppressTimeout)
  }

  uiState.suppressTimeout = scheduleTimeout(() => {
    clearSuppression()
  }, 30000)
}

function clearSuppression(): void {
  uiState.isTemporarilySuppressed = false
  uiState.suppressedWarningLevel = ''
  uiState.suppressedDomains = new Set()
  uiState.lastWarningState = ''
  if (uiState.suppressTimeout) {
    clearTimeout(uiState.suppressTimeout)
    uiState.suppressTimeout = null
  }
}

function minimizeToIndicator(): void {
  hideExpandedPanel()
  if (uiState.lastEmails && uiState.lastWarningLevel === 'medium') {
    showIndicator(
      uiState.lastIndicatorMessage,
      uiState.lastWarningLevel,
      uiState.lastEmails,
      uiState.lastDetailMessage
    )
  }
}

function showIndicator(
  indicatorMessage: string,
  warningLevel: string,
  emails: EmailData,
  detailMessage?: string
): void {
  let indicator = document.getElementById('gmail-safe-indicator')
  if (!indicator) {
    indicator = createIndicatorElement()
  }

  const styles = getWarningStyles(warningLevel as any)
  updateElementStyle(indicator, styles.container)

  const iconElement = indicator.querySelector('#indicator-icon') as HTMLElement
  setElementContent(iconElement, styles.icon)

  const messageElement = indicator.querySelector('#indicator-message') as HTMLElement
  setElementContent(messageElement, indicatorMessage)

  if (warningLevel === 'medium') {
    indicator.style.cursor = 'pointer'
    indicator.onclick = () => {
      hideIndicator()
      showExpandedPanel(detailMessage || indicatorMessage, emails, warningLevel)
    }
  } else {
    indicator.style.cursor = 'default'
    indicator.onclick = null
  }

  showElement(indicator)
}

function hideIndicator(): void {
  const indicator = document.getElementById('gmail-safe-indicator')
  hideElement(indicator)
}

function showExpandedPanel(message: string, emails: EmailData, warningLevel: string): void {
  let panel = document.getElementById('gmail-warning-panel')
  if (!panel) {
    panel = createExpandedPanelElement()

    // イベントハンドラーを設定
    panel.querySelector('#close-panel')?.addEventListener('click', async () => {
      await temporarilySuppressWarning()
    })

    panel.querySelector('#minimize-panel')?.addEventListener('click', () => {
      minimizeToIndicator()
    })
  }

  const styles = getWarningStyles(warningLevel as any)
  updateElementStyle(panel, styles.container)

  const iconElement = panel.querySelector('#warning-icon') as HTMLElement
  setElementContent(iconElement, styles.icon)

  const messageElement = panel.querySelector('#warning-message') as HTMLElement
  setElementHTML(messageElement, message)

  const recipientsElement = panel.querySelector('#recipients-list') as HTMLElement
  setElementHTML(recipientsElement, formatRecipientsList(emails))

  updatePanelButtons(panel, warningLevel)
  showElement(panel)
}

function hideExpandedPanel(): void {
  const panel = document.getElementById('gmail-warning-panel')
  hideElement(panel)
}

function updatePanelButtons(panel: HTMLElement, warningLevel: string): void {
  const minimizeBtn = panel.querySelector('#minimize-panel') as HTMLElement
  if (minimizeBtn) {
    minimizeBtn.style.display = warningLevel === 'medium' ? 'block' : 'none'
  }
}

// 外部ドメインを取得するヘルパー
async function getCurrentExternalDomains(emails: EmailData): Promise<Set<string>> {
  try {
    const companyDomains = await companyDomainsStorage.getValue()
    const allRecipients = [...emails.to, ...emails.cc, ...emails.bcc].filter(Boolean)
    return getExternalDomains(allRecipients, companyDomains)
  } catch (error) {
    return new Set()
  }
}
