import { companyDomainsStorage, extensionEnabledStorage, warningSettingsStorage } from '../../utils/storage';

// 設定の読み込み
async function loadSettings() {
  try {
    const companyDomains = await companyDomainsStorage.getValue();
    const extensionEnabled = await extensionEnabledStorage.getValue();
    const warningSettings = await warningSettingsStorage.getValue();
    
    const input = document.getElementById('company-domains') as HTMLInputElement;
    if (input) {
      input.value = companyDomains.join(', ');
    }
    
    const enabledCheckbox = document.getElementById('extension-enabled') as HTMLInputElement;
    if (enabledCheckbox) {
      enabledCheckbox.checked = extensionEnabled;
    }
    
    // 警告設定のチェックボックス
    const singleExternalCheckbox = document.getElementById('warn-single-external') as HTMLInputElement;
    const multipleExternalCheckbox = document.getElementById('warn-multiple-external') as HTMLInputElement;
    const bccExternalCheckbox = document.getElementById('warn-bcc-external') as HTMLInputElement;
    const newConversationCheckbox = document.getElementById('warn-new-conversation') as HTMLInputElement;
    const enableBodyCheckCheckbox = document.getElementById('enable-body-check') as HTMLInputElement;
    
    if (singleExternalCheckbox) singleExternalCheckbox.checked = warningSettings.showForSingleExternal;
    if (multipleExternalCheckbox) multipleExternalCheckbox.checked = warningSettings.showForMultipleExternal;
    if (bccExternalCheckbox) bccExternalCheckbox.checked = warningSettings.showForBccExternal;
    if (newConversationCheckbox) newConversationCheckbox.checked = warningSettings.showForNewConversation;
    if (enableBodyCheckCheckbox) enableBodyCheckCheckbox.checked = warningSettings.enableBodyCheck;
  } catch (error) {
    console.error('設定の読み込みに失敗しました:', error);
  }
}

// 設定の保存
async function saveSettings() {
  try {
    const input = document.getElementById('company-domains') as HTMLInputElement;
    const domains = input.value
      .split(',')
      .map(domain => domain.trim())
      .filter(domain => domain.length > 0);

    await companyDomainsStorage.setValue(domains);
    
    const enabledCheckbox = document.getElementById('extension-enabled') as HTMLInputElement;
    if (enabledCheckbox) {
      await extensionEnabledStorage.setValue(enabledCheckbox.checked);
    }
    
    // 警告設定の保存
    const singleExternalCheckbox = document.getElementById('warn-single-external') as HTMLInputElement;
    const multipleExternalCheckbox = document.getElementById('warn-multiple-external') as HTMLInputElement;
    const bccExternalCheckbox = document.getElementById('warn-bcc-external') as HTMLInputElement;
    const newConversationCheckbox = document.getElementById('warn-new-conversation') as HTMLInputElement;
    const enableBodyCheckCheckbox = document.getElementById('enable-body-check') as HTMLInputElement;
    
    await warningSettingsStorage.setValue({
      showForSingleExternal: singleExternalCheckbox?.checked ?? true,
      showForMultipleExternal: multipleExternalCheckbox?.checked ?? true,
      showForBccExternal: bccExternalCheckbox?.checked ?? true,
      showForNewConversation: newConversationCheckbox?.checked ?? true,
      enableBodyCheck: enableBodyCheckCheckbox?.checked ?? true,
    });
    
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
      statusDiv.innerHTML = '<div class="status success">設定を保存しました</div>';
      setTimeout(() => {
        statusDiv.innerHTML = '';
      }, 2000);
    }
  } catch (error) {
    console.error('設定の保存に失敗しました:', error);
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
      statusDiv.innerHTML = '<div class="status error">設定の保存に失敗しました</div>';
    }
  }
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  const saveButton = document.getElementById('save-settings');
  if (saveButton) {
    saveButton.addEventListener('click', saveSettings);
  }
});