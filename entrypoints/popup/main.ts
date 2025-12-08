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
    
    // 警告レベルのラジオボタン
    const warningLevelRadios = document.querySelectorAll('input[name="warning-level"]') as NodeListOf<HTMLInputElement>;
    warningLevelRadios.forEach(radio => {
      radio.checked = radio.value === warningSettings.warningLevel;
    });
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
    const selectedWarningLevel = document.querySelector('input[name="warning-level"]:checked') as HTMLInputElement;
    const warningLevel = selectedWarningLevel?.value || 'strict';
    
    await warningSettingsStorage.setValue({
      warningLevel: warningLevel as 'off' | 'basic' | 'strict',
      bodyCheckEnabled: warningLevel === 'strict',
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