import { companyDomainsStorage, extensionEnabledStorage, warningSettingsStorage } from '../utils/storage';

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

interface EmailData {
  to: string[];
  cc: string[];
  bcc: string[];
  from: string;
  body: string;
}

function checkComposeEmailAddresses() {
  try {
    const emails = getEmailAddresses();
    analyzeAndShowRealtimeWarning(emails);
  } catch (error) {
    console.log('メールアドレス取得エラー:', error);
  }
}

function getEmailAddresses(): EmailData {
  // To, CC, BCCのメールアドレスを取得
  const toElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=to] [data-hovercard-id],form [aria-label=To] [data-hovercard-id]');
  const ccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=cc] [data-hovercard-id],form [aria-label=Cc] [data-hovercard-id]');
  const bccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=bcc] [data-hovercard-id],form [aria-label=Bcc] [data-hovercard-id]');
  
  // Fromアドレスを取得
  const fromElement = document.querySelector('input[name="from"]') as HTMLInputElement;
  
  // メール本文を取得
  const bodyElement = document.querySelector('[name="body"]') as HTMLInputElement | HTMLTextAreaElement;
  const bodyText = bodyElement?.value || '';

  // UETフィールドを取得
  const uetElement = document.querySelector('[name="uet"]') as HTMLInputElement | HTMLTextAreaElement;
  const uetText = uetElement?.value || '';
  
  return {
    to: Array.from(toElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    cc: Array.from(ccElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    bcc: Array.from(bccElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    from: fromElement?.value || '',
    body: bodyText + '\n' + uetText,
  };
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
    
    // 無効の場合は非表示
    if (warningSettings.warningLevel === 'off') {
      hideRealtimeWarning();
      return;
    }
    
    // ドメイン分析
    const externalDomains = new Set<string>();
    const externalDomainsInBody = new Set<string>();
    
    allRecipients.forEach(email => {
      const domain = email.split('@')[1];
      if (domain && !companyDomains.includes(domain)) {
        externalDomains.add(domain);
        
        // 厳格モード時のみ本文チェック
        if (warningSettings.bodyCheckEnabled) {
          const emailDomainPattern = `@${domain.toLowerCase()}`;
          if (emails.body.toLowerCase().includes(emailDomainPattern)) {
            externalDomainsInBody.add(domain);
          }
        }
      }
    });
    
    // 警告レベルとメッセージを決定
    let warningLevel = 'safe';
    let warningMessage = '社内のみ';
    let detailMessage = '';
    
    if (externalDomains.size > 0) {
      const notInBodyDomains = new Set([...externalDomains].filter(d => !externalDomainsInBody.has(d)));
      
      if (warningSettings.bodyCheckEnabled && notInBodyDomains.size > 0) {
        // 本文に記載のない社外ドメインがある → 高警告
        warningLevel = 'high';
        warningMessage = `社外ドメイン ${externalDomains.size}件`;
        detailMessage = `本文に記載のない社外ドメイン: ${Array.from(notInBodyDomains).join(', ')}`;
      } else {
        // 社外ドメインがあるが本文に記載済み → 注意
        warningLevel = 'medium';
        warningMessage = `社外ドメイン ${externalDomains.size}件`;
        detailMessage = `社外ドメイン: ${Array.from(externalDomains).join(', ')}`;
      }
    }
    
    showRealtimeWarning(warningMessage, emails, warningLevel, detailMessage);
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
  suppressedWarningLevel: ''
};

function showRealtimeWarning(indicatorMessage: string, emails: EmailData, warningLevel: string = 'medium', detailMessage?: string) {
  let forceShow = false;
  
  // 抑制チェック
  if (uiState.isTemporarilySuppressed) {
    if (warningLevel !== uiState.suppressedWarningLevel) {
      clearSuppression();
      forceShow = true;
    } else {
      return;
    }
  }
  
  // 重複チェック
  const currentState = `${warningLevel}:${indicatorMessage}`;
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

function temporarilySuppressWarning() {
  uiState.suppressedWarningLevel = uiState.lastWarningLevel;
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
    indicator = createIndicator();
  }
  
  const styles = getWarningStyles(warningLevel);
  Object.assign(indicator.style, styles.container);
  
  const iconElement = indicator.querySelector('#indicator-icon');
  if (iconElement) iconElement.textContent = styles.icon;
  
  const messageElement = indicator.querySelector('#indicator-message');
  if (messageElement) messageElement.textContent = indicatorMessage;
  
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
  
  indicator.style.display = 'block';
}

function hideIndicator() {
  const indicator = document.getElementById('gmail-safe-indicator');
  if (indicator) indicator.style.display = 'none';
}

function createIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.id = 'gmail-safe-indicator';
  
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
  `;
  
  indicator.innerHTML = `
    <div style="display: flex; align-items: center; gap: 5px;">
      <span id="indicator-icon" style="font-size: 14px;"></span>
      <span id="indicator-message"></span>
    </div>
  `;
  
  // ホバー効果
  indicator.addEventListener('mouseenter', () => {
    if (indicator.style.cursor === 'pointer') {
      indicator.style.transform = 'scale(1.05)';
      indicator.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    }
  });
  
  indicator.addEventListener('mouseleave', () => {
    indicator.style.transform = 'scale(1)';
    indicator.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  });
  
  document.body.appendChild(indicator);
  return indicator;
}

function showExpandedPanel(message: string, emails: EmailData, warningLevel: string) {
  let panel = document.getElementById('gmail-warning-panel');
  if (!panel) {
    panel = createExpandedPanel();
  }
  
  const styles = getWarningStyles(warningLevel);
  Object.assign(panel.style, styles.container);
  
  const iconElement = panel.querySelector('#warning-icon');
  if (iconElement) iconElement.textContent = styles.icon;
  
  const messageElement = panel.querySelector('#warning-message');
  if (messageElement) messageElement.innerHTML = message;
  
  const recipientsElement = panel.querySelector('#recipients-list');
  if (recipientsElement) {
    const recipientsList = [];
    if (emails.to.length > 0) recipientsList.push(`TO: ${emails.to.join(', ')}`);
    if (emails.cc.length > 0) recipientsList.push(`CC: ${emails.cc.join(', ')}`);
    if (emails.bcc.length > 0) recipientsList.push(`BCC: ${emails.bcc.join(', ')}`);
    recipientsElement.innerHTML = recipientsList.join('<br>') || '送信先なし';
  }
  
  updatePanelButtons(panel, warningLevel);
  panel.style.display = 'block';
}

function hideExpandedPanel() {
  const panel = document.getElementById('gmail-warning-panel');
  if (panel) panel.style.display = 'none';
}

function createExpandedPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'gmail-warning-panel';
  
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
  `;
  
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
  `;
  
  panel.querySelector('#close-panel')?.addEventListener('click', () => {
    temporarilySuppressWarning();
  });
  
  panel.querySelector('#minimize-panel')?.addEventListener('click', () => {
    minimizeToIndicator();
  });
  
  document.body.appendChild(panel);
  return panel;
}

function getWarningStyles(warningLevel: string) {
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
  };
  return styles[warningLevel as keyof typeof styles] || styles.medium;
}

function updatePanelButtons(panel: HTMLElement, warningLevel: string) {
  const minimizeBtn = panel.querySelector('#minimize-panel') as HTMLElement;
  if (minimizeBtn) {
    minimizeBtn.style.display = warningLevel === 'medium' ? 'block' : 'none';
  }
}