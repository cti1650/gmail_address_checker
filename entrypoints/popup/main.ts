import { companyDomainsStorage, extensionEnabledStorage, getManagedPolicy, linkCheckEnabledStorage, warningSettingsStorage } from '../../utils/storage';
import type { ManagedPolicy, WarningLevel } from '../../utils/managed-policy';

// 組織ポリシー（読み込み時に取得し、保存時に固定項目の判定に使う）
let policy: ManagedPolicy = { companyDomains: [] };

// 組織ポリシーで固定された項目を操作不可にし、注記を表示する
function markManaged(noteId: string, inputs: HTMLInputElement[]) {
  inputs.forEach(input => {
    input.disabled = true;
  });
  const note = document.getElementById(noteId);
  if (note) {
    note.hidden = false;
  }
}

// 設定の読み込み
async function loadSettings() {
  try {
    const companyDomains = await companyDomainsStorage.getValue();
    const extensionEnabled = await extensionEnabledStorage.getValue();
    const warningSettings = await warningSettingsStorage.getValue();
    const linkCheckEnabled = await linkCheckEnabledStorage.getValue();
    policy = await getManagedPolicy();

    const input = document.getElementById('company-domains') as HTMLInputElement;
    if (input) {
      input.value = companyDomains.join(', ');
      if (policy.allowUserDomains === false) {
        input.value = '';
        markManaged('company-domains-managed', [input]);
      }
    }

    // 組織ポリシーで配布されたドメイン（読み取り専用）
    const managedContainer = document.getElementById('managed-domains');
    const managedList = document.getElementById('managed-domains-list');
    if (managedContainer && managedList && policy.companyDomains.length > 0) {
      managedList.textContent = policy.companyDomains.join(', ');
      managedContainer.hidden = false;
    }

    const enabledCheckbox = document.getElementById('extension-enabled') as HTMLInputElement;
    if (enabledCheckbox) {
      enabledCheckbox.checked = policy.extensionEnabled ?? extensionEnabled;
      if (policy.extensionEnabled !== undefined) {
        markManaged('extension-enabled-managed', [enabledCheckbox]);
      }
    }

    const linkCheckCheckbox = document.getElementById('link-check-enabled') as HTMLInputElement;
    if (linkCheckCheckbox) {
      linkCheckCheckbox.checked = policy.linkCheckEnabled ?? linkCheckEnabled;
      if (policy.linkCheckEnabled !== undefined) {
        markManaged('link-check-enabled-managed', [linkCheckCheckbox]);
      }
    }

    // 警告レベルのラジオボタン
    const warningLevel = policy.warningLevel ?? warningSettings.warningLevel;
    const warningLevelRadios = Array.from(document.querySelectorAll('input[name="warning-level"]') as NodeListOf<HTMLInputElement>);
    warningLevelRadios.forEach(radio => {
      radio.checked = radio.value === warningLevel;
    });
    if (policy.warningLevel) {
      markManaged('warning-level-managed', warningLevelRadios);
    }
  } catch (error) {
    console.error('設定の読み込みに失敗しました:', error);
  }
}

// 設定の保存（組織ポリシーで固定された項目は保存しない）
async function saveSettings() {
  try {
    const input = document.getElementById('company-domains') as HTMLInputElement;
    if (input && policy.allowUserDomains !== false) {
      const domains = input.value
        .split(',')
        .map(domain => domain.trim())
        .filter(domain => domain.length > 0);

      await companyDomainsStorage.setValue(domains);
    }

    const enabledCheckbox = document.getElementById('extension-enabled') as HTMLInputElement;
    if (enabledCheckbox && policy.extensionEnabled === undefined) {
      await extensionEnabledStorage.setValue(enabledCheckbox.checked);
    }

    const linkCheckCheckbox = document.getElementById('link-check-enabled') as HTMLInputElement;
    if (linkCheckCheckbox && policy.linkCheckEnabled === undefined) {
      await linkCheckEnabledStorage.setValue(linkCheckCheckbox.checked);
    }

    // 警告設定の保存
    if (!policy.warningLevel) {
      const selectedWarningLevel = document.querySelector('input[name="warning-level"]:checked') as HTMLInputElement;
      const warningLevel = (selectedWarningLevel?.value || 'strict') as WarningLevel;

      await warningSettingsStorage.setValue({
        warningLevel,
        bodyCheckEnabled: warningLevel === 'strict',
      });
    }

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
