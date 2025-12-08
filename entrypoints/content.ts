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
  hideElement
} from '../utils/ui'

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  async main() {
    
    // Gmailのコンポーズ画面を監視
    const observer = new MutationObserver(() => {
      checkComposeEmailAddresses();
    });

    // DOMの変更を監視
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 定期的にもチェック（頻度を下げて負荷軽減）
    setInterval(checkComposeEmailAddresses, 1000);
  },
});

function checkComposeEmailAddresses() {
  try {
    const emails = getEmailAddresses();
    analyzeAndShowRealtimeWarning(emails);
  } catch (error) {
    console.log('メールアドレス取得エラー:', error);
  }
}

async function analyzeAndShowRealtimeWarning(emails: EmailData) {
  try {
    const extensionEnabled = await extensionEnabledStorage.getValue();
    if (!extensionEnabled) {
      hideRealtimeWarning();
      return;
    }
    
    const allRecipients = [...emails.to, ...emails.cc, ...emails.bcc].filter(Boolean);
    if (allRecipients.length === 0) {
      hideRealtimeWarning();
      return;
    }
    
    const companyDomains = await companyDomainsStorage.getValue();
    const warningSettings = await warningSettingsStorage.getValue();
    
    const result = analyzeEmailSecurity(emails, companyDomains, warningSettings);
    
    await showRealtimeWarning(result.message, emails, result.level, result.detailMessage);
  } catch (error) {
    hideRealtimeWarning();
  }
}

// 統一状態管理
interface UIState {
  lastWarningState: string;
  lastWarningLevel: string;
  autoHideTimeout: NodeJS.Timeout | null;
  lastIndicatorMessage: string;
  lastDetailMessage: string;
  lastEmails: EmailData | null;
  isTemporarilySuppressed: boolean;
  suppressTimeout: NodeJS.Timeout | null;
  suppressedWarningLevel: string;
  suppressedDomains: Set<string>;
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
  suppressedDomains: new Set()
};

async function showRealtimeWarning(indicatorMessage: string, emails: EmailData, warningLevel: string = 'medium', detailMessage?: string) {
  let forceShow = false;
  
  // 抑制チェック
  if (uiState.isTemporarilySuppressed) {
    const levelChanged = warningLevel !== uiState.suppressedWarningLevel;
    const currentExternalDomains = await getCurrentExternalDomains(emails);
    const domainsChanged = !setsEqual(currentExternalDomains, uiState.suppressedDomains);
    
    if (levelChanged || domainsChanged) {
      clearSuppression();
      forceShow = true;
    } else {
      return;
    }
  }
  
  // 重複チェック（本文の内容も含める）
  const currentState = `${warningLevel}:${indicatorMessage}:${detailMessage}`;
  if (!forceShow && currentState === uiState.lastWarningState) {
    return;
  }
  uiState.lastWarningState = currentState;
  
  // 状態を保存
  uiState.lastWarningLevel = warningLevel;
  uiState.lastIndicatorMessage = indicatorMessage;
  uiState.lastDetailMessage = detailMessage || indicatorMessage;
  uiState.lastEmails = emails;
  
  // タイムアウトクリア
  if (uiState.autoHideTimeout) {
    clearTimeout(uiState.autoHideTimeout);
    uiState.autoHideTimeout = null;
  }

  // UI表示制御
  if (warningLevel === 'safe') {
    showIndicator(indicatorMessage, warningLevel, emails, detailMessage);
    hideExpandedPanel();
    uiState.autoHideTimeout = setTimeout(() => {
      hideIndicator();
      uiState.autoHideTimeout = null;
    }, 10000);
  } else if (warningLevel === 'medium') {
    showIndicator(indicatorMessage, warningLevel, emails, detailMessage);
    hideExpandedPanel();
  } else {
    hideIndicator();
    showExpandedPanel(detailMessage || indicatorMessage, emails, warningLevel);
  }
}

function hideRealtimeWarning() {
  hideIndicator();
  hideExpandedPanel();
  uiState.lastWarningState = '';
}

async function temporarilySuppressWarning() {
  uiState.suppressedWarningLevel = uiState.lastWarningLevel;
  uiState.suppressedDomains = uiState.lastEmails ? await getCurrentExternalDomains(uiState.lastEmails) : new Set();
  uiState.isTemporarilySuppressed = true;
  hideIndicator();
  hideExpandedPanel();
  
  if (uiState.suppressTimeout) {
    clearTimeout(uiState.suppressTimeout);
  }
  
  uiState.suppressTimeout = setTimeout(() => {
    clearSuppression();
  }, 30000);
}

function clearSuppression() {
  uiState.isTemporarilySuppressed = false;
  uiState.suppressedWarningLevel = '';
  uiState.suppressedDomains = new Set();
  uiState.lastWarningState = '';
  if (uiState.suppressTimeout) {
    clearTimeout(uiState.suppressTimeout);
    uiState.suppressTimeout = null;
  }
}

function minimizeToIndicator() {
  hideExpandedPanel();
  if (uiState.lastEmails && uiState.lastWarningLevel === 'medium') {
    showIndicator(uiState.lastIndicatorMessage, uiState.lastWarningLevel, uiState.lastEmails, uiState.lastDetailMessage);
  }
}

function showIndicator(indicatorMessage: string, warningLevel: string, emails: EmailData, detailMessage?: string) {
  let indicator = document.getElementById('gmail-safe-indicator');
  if (!indicator) {
    indicator = createIndicatorElement();
  }
  
  const styles = getWarningStyles(warningLevel as any);
  updateElementStyle(indicator, styles.container);
  
  const iconElement = indicator.querySelector('#indicator-icon') as HTMLElement;
  setElementContent(iconElement, styles.icon);
  
  const messageElement = indicator.querySelector('#indicator-message') as HTMLElement;
  setElementContent(messageElement, indicatorMessage);
  
  if (warningLevel === 'medium') {
    indicator.style.cursor = 'pointer';
    indicator.onclick = () => {
      hideIndicator();
      showExpandedPanel(detailMessage || indicatorMessage, emails, warningLevel);
    };
  } else {
    indicator.style.cursor = 'default';
    indicator.onclick = null;
  }
  
  showElement(indicator);
}

function hideIndicator() {
  const indicator = document.getElementById('gmail-safe-indicator');
  hideElement(indicator);
}

function showExpandedPanel(message: string, emails: EmailData, warningLevel: string) {
  let panel = document.getElementById('gmail-warning-panel');
  if (!panel) {
    panel = createExpandedPanelElement();
    
    // イベントハンドラーを設定
    panel.querySelector('#close-panel')?.addEventListener('click', async () => {
      await temporarilySuppressWarning();
    });
    
    panel.querySelector('#minimize-panel')?.addEventListener('click', () => {
      minimizeToIndicator();
    });
  }
  
  const styles = getWarningStyles(warningLevel as any);
  updateElementStyle(panel, styles.container);
  
  const iconElement = panel.querySelector('#warning-icon') as HTMLElement;
  setElementContent(iconElement, styles.icon);
  
  const messageElement = panel.querySelector('#warning-message') as HTMLElement;
  setElementHTML(messageElement, message);
  
  const recipientsElement = panel.querySelector('#recipients-list') as HTMLElement;
  setElementHTML(recipientsElement, formatRecipientsList(emails));
  
  updatePanelButtons(panel, warningLevel);
  showElement(panel);
}

function hideExpandedPanel() {
  const panel = document.getElementById('gmail-warning-panel');
  hideElement(panel);
}


function updatePanelButtons(panel: HTMLElement, warningLevel: string) {
  const minimizeBtn = panel.querySelector('#minimize-panel') as HTMLElement;
  if (minimizeBtn) {
    minimizeBtn.style.display = warningLevel === 'medium' ? 'block' : 'none';
  }
}

// 外部ドメインを取得するヘルパー関数
async function getCurrentExternalDomains(emails: EmailData): Promise<Set<string>> {
  try {
    const companyDomains = await companyDomainsStorage.getValue();
    const allRecipients = [...emails.to, ...emails.cc, ...emails.bcc].filter(Boolean);
    return getExternalDomains(allRecipients, companyDomains);
  } catch (error) {
    return new Set();
  }
}