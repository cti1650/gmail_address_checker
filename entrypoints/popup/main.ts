import { companyDomainsStorage, extensionEnabledStorage, getManagedPolicy, linkCheckEnabledStorage, trustedLinkDomainsStorage, warningSettingsStorage } from '../../utils/storage';
import type { ManagedPolicy, WarningLevel } from '../../utils/managed-policy';

// 組織ポリシー（読み込み時に取得し、保存時に固定項目の判定に使う）
let policy: ManagedPolicy = { companyDomains: [], trustedLinkDomains: [] };

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

// カンマ区切りの入力をドメイン一覧にする
function parseDomainList(value: string): string[] {
  return value
    .split(',')
    .map(domain => domain.trim().toLowerCase())
    .filter(domain => domain.length > 0);
}

// ユーザー入力のドメイン欄と、組織ポリシーで配布されたドメインの表示を設定する
function renderDomainSetting(ids: { input: string; managedNote: string; managedContainer: string; managedList: string }, userDomains: string[], managedDomains: string[]) {
  const input = document.getElementById(ids.input) as HTMLInputElement | null;
  if (input) {
    input.value = userDomains.join(', ');
    if (policy.allowUserDomains === false) {
      input.value = '';
      markManaged(ids.managedNote, [input]);
    }
  }

  const container = document.getElementById(ids.managedContainer);
  const list = document.getElementById(ids.managedList);
  if (container && list && managedDomains.length > 0) {
    list.textContent = managedDomains.join(', ');
    container.hidden = false;
  }
}

// 設定の読み込み
async function loadSettings() {
  try {
    const companyDomains = await companyDomainsStorage.getValue();
    const extensionEnabled = await extensionEnabledStorage.getValue();
    const warningSettings = await warningSettingsStorage.getValue();
    const linkCheckEnabled = await linkCheckEnabledStorage.getValue();
    const trustedLinkDomains = await trustedLinkDomainsStorage.getValue();
    policy = await getManagedPolicy();

    // 組織ポリシーで配布されたドメインは読み取り専用で表示
    renderDomainSetting(
      { input: 'company-domains', managedNote: 'company-domains-managed', managedContainer: 'managed-domains', managedList: 'managed-domains-list' },
      companyDomains,
      policy.companyDomains
    );
    renderDomainSetting(
      { input: 'trusted-link-domains', managedNote: 'trusted-link-domains-managed', managedContainer: 'managed-trusted-domains', managedList: 'managed-trusted-domains-list' },
      trustedLinkDomains,
      policy.trustedLinkDomains
    );

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
    if (policy.allowUserDomains !== false) {
      const companyInput = document.getElementById('company-domains') as HTMLInputElement | null;
      if (companyInput) {
        await companyDomainsStorage.setValue(parseDomainList(companyInput.value));
      }
      const trustedInput = document.getElementById('trusted-link-domains') as HTMLInputElement | null;
      if (trustedInput) {
        await trustedLinkDomainsStorage.setValue(parseDomainList(trustedInput.value));
      }
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
