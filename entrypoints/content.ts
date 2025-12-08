import { companyDomainsStorage, extensionEnabledStorage, warningSettingsStorage } from '../utils/storage';

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  async main() {
    console.log('Gmail誤送信防止拡張機能が起動しました');
    
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

interface EmailAddresses {
  to: string[];
  cc: string[];
  bcc: string[];
  from: string;
}

function checkComposeEmailAddresses() {
  try {
    const emails = getEmailAddresses();
    analyzeAndShowRealtimeWarning(emails);
  } catch (error) {
    console.log('メールアドレス取得エラー:', error);
  }
}

function getEmailAddresses(): EmailAddresses {
  // To, CC, BCCのメールアドレスを取得
  const toElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=to] [data-hovercard-id],form [aria-label=To] [data-hovercard-id]');
  const ccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=cc] [data-hovercard-id],form [aria-label=Cc] [data-hovercard-id]');
  const bccElements = document.querySelectorAll('[aria-label=新規メッセージ] [name=bcc] [data-hovercard-id],form [aria-label=Bcc] [data-hovercard-id]');
  
  // Fromアドレスを取得
  const fromElement = document.querySelector('input[name="from"]') as HTMLInputElement;
  
  return {
    to: Array.from(toElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    cc: Array.from(ccElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    bcc: Array.from(bccElements).map(el => el.getAttribute('data-hovercard-id') || ''),
    from: fromElement?.value || ''
  };
}

async function analyzeAndShowRealtimeWarning(emails: EmailAddresses) {
  // 拡張機能が無効な場合は警告パネルを非表示にして終了
  const extensionEnabled = await extensionEnabledStorage.getValue();
  if (!extensionEnabled) {
    hideRealtimeWarning();
    return;
  }
  
  const allRecipients = [...emails.to, ...emails.cc, ...emails.bcc].filter(Boolean);
  
  // メールアドレスがない場合は警告パネルを非表示
  if (allRecipients.length === 0) {
    hideRealtimeWarning();
    return;
  }
  
  // 設定から社内ドメインと警告設定を取得
  const companyDomains = await companyDomainsStorage.getValue();
  const warningSettings = await warningSettingsStorage.getValue();
  
  // ドメイン分析
  const domains = new Set<string>();
  const internalDomains = new Set<string>();
  const externalDomains = new Set<string>();
  
  allRecipients.forEach(email => {
    const domain = email.split('@')[1];
    if (domain) {
      domains.add(domain);
      if (companyDomains.includes(domain)) {
        internalDomains.add(domain);
      } else {
        externalDomains.add(domain);
      }
    }
  });
  
  // 警告レベルとメッセージを決定
  let warningLevel = 'safe';
  let warningMessage = '';
  let warningsList: string[] = [];
  
  // 条件1: 社内ドメインのみ -> 安全
  if (externalDomains.size === 0) {
    warningLevel = 'safe';
    warningMessage = `✓ すべて社内ドメインです (${internalDomains.size}ドメイン)`;
  } else {
    // 条件2: 社外ドメインが1つ -> 注意
    if (externalDomains.size === 1 && warningSettings.showForSingleExternal) {
      warningLevel = 'medium';
      warningsList.push(`⚠️ 社外ドメイン: ${Array.from(externalDomains)[0]}`);
    }
    
    // 条件3: 社外ドメインが2つ以上 -> 強い警告
    if (externalDomains.size >= 2 && warningSettings.showForMultipleExternal) {
      warningLevel = 'high';
      warningsList.push(`🚨 複数の社外ドメイン: ${Array.from(externalDomains).join(', ')}`);
    }
    
    // 条件4: BCCに社外が入っている場合 -> 強い警告
    const bccExternalDomains = emails.bcc
      .map(email => email.split('@')[1])
      .filter(domain => domain && !companyDomains.includes(domain));
    
    if (bccExternalDomains.length > 0 && warningSettings.showForBccExternal) {
      warningLevel = 'high';
      warningsList.push(`🚨 BCCに社外ドメイン`);
    }
    
    // 条件5: スレッド内初登場チェック（簡易版）
    const isNewConversation = !document.querySelector('div[data-thread-id]');
    if (isNewConversation && externalDomains.size > 0 && warningSettings.showForNewConversation) {
      warningsList.push(`📧 新規メールに社外ドメイン`);
    }
    
    // 条件6: FromとReply-toの不一致チェック（簡易版）
    const fromDomain = emails.from.split('@')[1];
    if (fromDomain && companyDomains.includes(fromDomain)) {
      const replyToElements = document.querySelectorAll('input[name="replyto"]');
      if (replyToElements.length > 0) {
        warningsList.push(`↩️ Reply-to設定あり`);
      }
    }
    
    if (warningsList.length > 0) {
      warningMessage = warningsList.join('<br>');
    } else if (externalDomains.size > 0) {
      warningMessage = `外部ドメイン ${externalDomains.size}件`;
    }
  }
  
  showRealtimeWarning(warningMessage, emails, warningLevel);
}

let lastWarningState = '';
let lastWarningLevel = '';

function showRealtimeWarning(message: string, emails: EmailAddresses, warningLevel: string = 'medium') {
  // 更新が必要かチェック（レンダリング負荷軽減）
  const currentState = `${warningLevel}:${message}`;
  if (currentState === lastWarningState) {
    return;
  }
  lastWarningState = currentState;
  
  if (warningLevel === 'safe') {
    // 安全時：小さなインジケーターのみ表示
    showMinimizedIndicator(message);
    hideExpandedPanel();
  } else {
    // 警告時：拡張可能パネル表示
    hideMinimizedIndicator();
    showExpandedPanel(message, emails, warningLevel);
  }
}

function hideRealtimeWarning() {
  hideMinimizedIndicator();
  hideExpandedPanel();
  lastWarningState = '';
}

function showMinimizedIndicator(message: string) {
  let indicator = document.getElementById('gmail-safe-indicator');
  if (!indicator) {
    indicator = createMinimizedIndicator();
  }
  
  const messageElement = indicator.querySelector('#safe-message');
  if (messageElement) {
    messageElement.textContent = message;
  }
  
  indicator.style.display = 'block';
}

function hideMinimizedIndicator() {
  const indicator = document.getElementById('gmail-safe-indicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}

function createMinimizedIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.id = 'gmail-safe-indicator';
  
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #e8f5e8;
    border: 1px solid #137333;
    border-radius: 20px;
    padding: 8px 12px;
    font-family: 'Roboto', Arial, sans-serif;
    font-size: 12px;
    color: #137333;
    z-index: 9998;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    display: none;
    cursor: default;
    user-select: none;
  `;
  
  indicator.innerHTML = `
    <div style="display: flex; align-items: center; gap: 5px;">
      <span style="font-size: 14px;">✓</span>
      <span id="safe-message"></span>
    </div>
  `;
  
  document.body.appendChild(indicator);
  return indicator;
}

function showExpandedPanel(message: string, emails: EmailAddresses, warningLevel: string) {
  let panel = document.getElementById('gmail-warning-panel');
  if (!panel) {
    panel = createExpandedPanel();
  }
  
  // 警告レベルに応じたスタイル設定
  let backgroundColor, borderColor, textColor, icon;
  switch (warningLevel) {
    case 'medium':
      backgroundColor = '#fef7e0';
      borderColor = '#fbbc04';
      textColor = '#b06000';
      icon = '⚠️';
      break;
    case 'high':
      backgroundColor = '#fce8e6';
      borderColor = '#ea4335';
      textColor = '#d93025';
      icon = '🚨';
      break;
    default:
      backgroundColor = '#f1f3f4';
      borderColor = '#dadce0';
      textColor = '#5f6368';
      icon = 'ℹ️';
  }
  
  panel.style.backgroundColor = backgroundColor;
  panel.style.borderColor = borderColor;
  panel.style.color = textColor;
  
  // アイコンとメッセージを更新
  const iconElement = panel.querySelector('#warning-icon');
  if (iconElement) {
    iconElement.textContent = icon;
  }
  
  const messageElement = panel.querySelector('#warning-message');
  if (messageElement) {
    messageElement.innerHTML = message;
  }
  
  // 送信先一覧を更新
  const recipientsElement = panel.querySelector('#recipients-list');
  if (recipientsElement) {
    const recipientsList = [];
    if (emails.to.length > 0) recipientsList.push(`TO: ${emails.to.join(', ')}`);
    if (emails.cc.length > 0) recipientsList.push(`CC: ${emails.cc.join(', ')}`);
    if (emails.bcc.length > 0) recipientsList.push(`BCC: ${emails.bcc.join(', ')}`);
    
    recipientsElement.innerHTML = recipientsList.join('<br>') || '送信先なし';
  }
  
  panel.style.display = 'block';
}

function hideExpandedPanel() {
  const panel = document.getElementById('gmail-warning-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

function createExpandedPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'gmail-warning-panel';
  
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 350px;
    min-height: 150px;
    padding: 15px;
    border: 2px solid;
    border-radius: 8px;
    font-family: 'Roboto', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    z-index: 9999;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    display: none;
    max-height: 400px;
    overflow-y: auto;
    resize: both;
    cursor: move;
  `;
  
  panel.innerHTML = `
    <div id="panel-header" style="
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      margin-bottom: 10px;
      cursor: move;
      user-select: none;
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span id="warning-icon" style="font-size: 18px;"></span>
        <strong style="font-size: 16px;">送信先チェック</strong>
      </div>
      <div style="display: flex; gap: 5px;">
        <button id="minimize-panel" style="
          background: transparent;
          border: none;
          font-size: 16px;
          cursor: pointer;
          color: inherit;
          padding: 2px 5px;
          border-radius: 3px;
        " title="最小化">−</button>
        <button id="close-panel" style="
          background: transparent;
          border: none;
          font-size: 16px;
          cursor: pointer;
          color: inherit;
          padding: 2px 5px;
          border-radius: 3px;
        " title="閉じる">×</button>
      </div>
    </div>
    
    <div id="warning-message" style="margin-bottom: 10px; font-weight: 500;"></div>
    
    <div style="font-size: 12px; margin-top: 10px;">
      <strong>送信先:</strong><br>
      <div id="recipients-list" style="margin-top: 5px; font-family: monospace;"></div>
    </div>
  `;
  
  // ドラッグ移動機能
  makeDraggable(panel);
  
  // ボタンのイベントリスナー
  panel.querySelector('#close-panel')?.addEventListener('click', () => {
    hideRealtimeWarning();
  });
  
  panel.querySelector('#minimize-panel')?.addEventListener('click', () => {
    hideExpandedPanel();
  });
  
  document.body.appendChild(panel);
  return panel;
}

function makeDraggable(element: HTMLElement) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = element.querySelector('#panel-header') as HTMLElement;
  
  if (header) {
    header.onmousedown = dragMouseDown;
  } else {
    element.onmousedown = dragMouseDown;
  }
  
  function dragMouseDown(e: MouseEvent) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e: MouseEvent) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    const newTop = element.offsetTop - pos2;
    const newLeft = element.offsetLeft - pos1;
    
    // 画面外に移動しないよう制限
    const maxTop = window.innerHeight - element.offsetHeight;
    const maxLeft = window.innerWidth - element.offsetWidth;
    
    element.style.top = Math.max(0, Math.min(newTop, maxTop)) + "px";
    element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + "px";
    element.style.right = 'auto';
  }
  
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}