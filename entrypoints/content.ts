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
    
    // 外部ドメインを本文での言及状況で分類
    const externalDomainsInBody = new Set<string>();
    const externalDomainsNotInBody = new Set<string>();
    
    allRecipients.forEach(email => {
      const domain = email.split('@')[1];
      if (domain) {
        domains.add(domain);
        if (companyDomains.includes(domain)) {
          internalDomains.add(domain);
        } else {
          externalDomains.add(domain);
          
          // 本文チェックが有効な場合のみ分類、無効な場合は分類しない
          if (warningSettings.enableBodyCheck) {
            if (emails.body.toLowerCase().includes(domain.toLowerCase())) {
              externalDomainsInBody.add(domain);
            } else {
              externalDomainsNotInBody.add(domain);
            }
          }
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
      warningMessage = `社内のみ`;
    } else {
      // 本文チェックが有効かどうかで分岐
      if (warningSettings.enableBodyCheck) {
        const highRiskDomains = Array.from(externalDomainsNotInBody);
        const lowRiskDomains = Array.from(externalDomainsInBody);
        
        // 本文に記載されていない社外ドメインがある場合 -> 警告
        if (highRiskDomains.length > 0 && warningSettings.showForSingleExternal) {
          warningLevel = 'high';
          warningsList.push(`本文に記載のない社外ドメイン: ${highRiskDomains.join(', ')}`);
        }
        
        // すべての社外ドメインが本文に記載されている場合 -> 注意
        if (lowRiskDomains.length > 0 && warningLevel !== 'high') {
          warningLevel = 'medium';
          // インジケーター用に簡潔な表示
          warningMessage = `社外ドメイン ${lowRiskDomains.length}件`;
          // 詳細パネル用に詳細な情報を追加
          warningsList.push(`本文に記載済みの社外ドメイン: ${lowRiskDomains.join(', ')}`);
        }
        
        // 複数の社外ドメインの場合は追加情報として表示
        if (externalDomains.size >= 2 && warningSettings.showForMultipleExternal) {
          warningsList.push(`社外ドメイン合計 ${externalDomains.size}件`);
        }
      } else {
        // 本文チェック無効時は従来通り
        if (externalDomains.size === 1 && warningSettings.showForSingleExternal) {
          warningLevel = 'medium';
          warningMessage = `社外ドメイン 1件`;
          warningsList.push(`社外ドメイン: ${Array.from(externalDomains)[0]}`);
        }
        
        // 複数の社外ドメイン -> 警告
        if (externalDomains.size >= 2 && warningSettings.showForMultipleExternal) {
          warningLevel = 'high';
          warningsList.push(`複数の社外ドメイン: ${Array.from(externalDomains).join(', ')}`);
        }
      }
      
      // 条件5: BCCに社外が入っている場合 -> 強い警告
      const bccExternalDomains = emails.bcc
        .map(email => email.split('@')[1])
        .filter(domain => domain && !companyDomains.includes(domain));
      
      if (bccExternalDomains.length > 0 && warningSettings.showForBccExternal) {
        warningLevel = 'high';
        warningsList.push(`🚨 BCCに社外ドメイン`);
      }
      
      // 条件6: スレッド内初登場チェック（簡易版）
      const isNewConversation = !document.querySelector('div[data-thread-id]');
      if (isNewConversation && externalDomains.size > 0 && warningSettings.showForNewConversation) {
        warningsList.push(`📧 新規メールに社外ドメイン`);
      }
      
      // 条件7: FromとReply-toの不一致チェック（簡易版）
      const fromDomain = emails.from.split('@')[1];
      if (fromDomain && companyDomains.includes(fromDomain)) {
        const replyToElements = document.querySelectorAll('input[name="replyto"]');
        if (replyToElements.length > 0) {
          warningsList.push(`↩️ Reply-to設定あり`);
        }
      }
      
      // インジケーター用のメッセージが設定されていない場合のフォールバック
      if (!warningMessage && warningsList.length > 0) {
        if (warningLevel === 'high') {
          warningMessage = `社外ドメイン ${externalDomains.size}件`;
        } else if (warningLevel === 'medium') {
          warningMessage = `社外ドメイン ${externalDomains.size}件`;
        }
      }
      
      // 詳細パネル用のメッセージは変更なし
      if (warningsList.length === 0 && externalDomains.size > 0) {
        warningsList.push(`外部ドメイン ${externalDomains.size}件`);
      }
    }
    
    // 詳細パネル用のメッセージを作成
    const detailMessage = warningsList.length > 0 ? warningsList.join('<br>') : warningMessage;
    
    showRealtimeWarning(warningMessage, emails, warningLevel, detailMessage);
  } catch (error) {
    // Extension context invalidatedエラーなどを処理
    console.log('拡張機能コンテキストエラー:', error);
    hideRealtimeWarning();
    return;
  }
}

let lastWarningState = '';
let lastWarningLevel = '';
let autoHideTimeout: NodeJS.Timeout | null = null;
let lastIndicatorMessage = '';
let lastDetailMessage = '';
let lastEmails: EmailData | null = null;
let isTemporarilySuppressed = false;
let suppressTimeout: NodeJS.Timeout | null = null;
let suppressedWarningLevel = '';

function showRealtimeWarning(indicatorMessage: string, emails: EmailData, warningLevel: string = 'medium', detailMessage?: string) {
  let forceShow = false;
  
  // 一時的に抑制されている場合、警告レベルが変化したら抑制解除
  if (isTemporarilySuppressed) {
    console.log(`抑制中: 現在=${warningLevel}, 抑制レベル=${suppressedWarningLevel}`);
    if (warningLevel !== suppressedWarningLevel) {
      console.log('警告レベル変化 → 抑制解除');
      clearSuppression();
      forceShow = true; // 強制表示フラグ
    } else {
      console.log('同じ警告レベル → 抑制継続');
      return;
    }
  }
  
  // 強制表示でない場合のみ重複チェック
  if (!forceShow) {
    const currentState = `${warningLevel}:${indicatorMessage}`;
    if (currentState === lastWarningState) {
      return;
    }
    lastWarningState = currentState;
  } else {
    // 強制表示時は状態を更新
    const currentState = `${warningLevel}:${indicatorMessage}`;
    lastWarningState = currentState;
    console.log('強制表示実行');
  }
  
  // 最小化復帰用に現在の状態を保存
  lastWarningLevel = warningLevel;
  lastIndicatorMessage = indicatorMessage;
  lastDetailMessage = detailMessage || indicatorMessage;
  lastEmails = emails;
  
  // 既存のタイムアウトをクリア
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout);
    autoHideTimeout = null;
  }

  if (warningLevel === 'safe') {
    // 安全時：小さなインジケーターのみ表示、10秒後に自動非表示
    showMinimizedIndicator(indicatorMessage, warningLevel, emails, detailMessage);
    hideExpandedPanel();
    
    // 10秒後に自動非表示
    autoHideTimeout = setTimeout(() => {
      hideMinimizedIndicator();
      autoHideTimeout = null;
    }, 10000);
  } else if (warningLevel === 'medium') {
    // 注意時：小さなインジケーターのみ表示（クリックで詳細展開）
    showMinimizedIndicator(indicatorMessage, warningLevel, emails, detailMessage);
    hideExpandedPanel();
  } else {
    // 強い警告時：詳細パネルを即座に表示
    hideMinimizedIndicator();
    showExpandedPanel(detailMessage || indicatorMessage, emails, warningLevel);
  }
}

function hideRealtimeWarning() {
  hideMinimizedIndicator();
  hideExpandedPanel();
  lastWarningState = '';
}

function temporarilySuppressWarning() {
  // 現在の警告レベルを記録して抑制
  suppressedWarningLevel = lastWarningLevel;
  isTemporarilySuppressed = true;
  hideMinimizedIndicator();
  hideExpandedPanel();
  
  // 既存の抑制タイマーをクリア
  if (suppressTimeout) {
    clearTimeout(suppressTimeout);
  }
  
  // 30秒後に抑制を解除
  suppressTimeout = setTimeout(() => {
    clearSuppression();
  }, 30000);
}

function clearSuppression() {
  console.log('抑制解除実行');
  isTemporarilySuppressed = false;
  suppressedWarningLevel = '';
  // 抑制解除時は前回の状態をクリアして、次回確実に表示されるようにする
  lastWarningState = '';
  if (suppressTimeout) {
    clearTimeout(suppressTimeout);
    suppressTimeout = null;
  }
}

function minimizeToIndicator() {
  // 詳細パネルを非表示にして、インジケーターを表示
  hideExpandedPanel();
  if (lastEmails && lastWarningLevel === 'medium') {
    showMinimizedIndicator(lastIndicatorMessage, lastWarningLevel, lastEmails, lastDetailMessage);
  }
}

function showMinimizedIndicator(indicatorMessage: string, warningLevel: string, emails: EmailData, detailMessage?: string) {
  let indicator = document.getElementById('gmail-safe-indicator');
  if (!indicator) {
    indicator = createMinimizedIndicator();
  }
  
  // 警告レベルに応じたスタイル設定
  let backgroundColor, borderColor, textColor, icon;
  switch (warningLevel) {
    case 'safe':
      backgroundColor = '#e8f5e8';
      borderColor = '#137333';
      textColor = '#137333';
      icon = '✓';
      break;
    case 'medium':
      backgroundColor = '#fef7e0';
      borderColor = '#fbbc04';
      textColor = '#b06000';
      icon = '⚠️';
      break;
    default:
      backgroundColor = '#f1f3f4';
      borderColor = '#dadce0';
      textColor = '#5f6368';
      icon = 'ℹ️';
  }
  
  indicator.style.backgroundColor = backgroundColor;
  indicator.style.borderColor = borderColor;
  indicator.style.color = textColor;
  
  const iconElement = indicator.querySelector('#indicator-icon');
  if (iconElement) {
    iconElement.textContent = icon;
  }
  
  const messageElement = indicator.querySelector('#indicator-message');
  if (messageElement) {
    messageElement.textContent = indicatorMessage;
  }
  
  // 注意時のみクリック可能にする
  if (warningLevel === 'medium') {
    indicator.style.cursor = 'pointer';
    indicator.onclick = () => {
      hideMinimizedIndicator();
      showExpandedPanel(detailMessage || indicatorMessage, emails, warningLevel);
    };
  } else {
    indicator.style.cursor = 'default';
    indicator.onclick = null;
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
  
  // ホバー効果を追加
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
  
  // ボタンの表示を制御
  updatePanelButtons(panel, warningLevel);
  
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
          font-size: 14px;
          cursor: pointer;
          color: inherit;
          padding: 2px 5px;
          border-radius: 3px;
          font-family: monospace;
        " title="最小化（インジケーターに戻る）">＿</button>
        <button id="close-panel" style="
          background: transparent;
          border: none;
          font-size: 16px;
          cursor: pointer;
          color: inherit;
          padding: 2px 5px;
          border-radius: 3px;
        " title="30秒間非表示">×</button>
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
    temporarilySuppressWarning();
  });
  
  panel.querySelector('#minimize-panel')?.addEventListener('click', () => {
    minimizeToIndicator();
  });
  
  document.body.appendChild(panel);
  return panel;
}

function updatePanelButtons(panel: HTMLElement, warningLevel: string) {
  const minimizeBtn = panel.querySelector('#minimize-panel') as HTMLElement;
  
  // 注意レベル以外では最小化ボタンを非表示
  if (minimizeBtn) {
    if (warningLevel === 'medium') {
      minimizeBtn.style.display = 'block';
    } else {
      minimizeBtn.style.display = 'none';
    }
  }
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