import { mergeCompanyDomains } from './company-domains'

export type WarningLevel = 'off' | 'basic' | 'strict'

// 組織ポリシー（chrome.storage.managed）の値。未配布の項目は undefined
export interface ManagedPolicy {
  companyDomains: string[]
  trustedLinkDomains: string[]
  allowUserDomains?: boolean
  warningLevel?: WarningLevel
  extensionEnabled?: boolean
  linkCheckEnabled?: boolean
}

const WARNING_LEVELS: readonly WarningLevel[] = ['off', 'basic', 'strict']

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

// managed storage の生データを検証し、不正な型の値は未配布として扱う
export function parseManagedPolicy(raw: Record<string, unknown>): ManagedPolicy {
  const level = raw.warningLevel
  return {
    companyDomains: mergeCompanyDomains(raw.companyDomains, []),
    trustedLinkDomains: mergeCompanyDomains(raw.trustedLinkDomains, []),
    allowUserDomains: asBoolean(raw.allowUserDomains),
    warningLevel: WARNING_LEVELS.includes(level as WarningLevel) ? (level as WarningLevel) : undefined,
    extensionEnabled: asBoolean(raw.extensionEnabled),
    linkCheckEnabled: asBoolean(raw.linkCheckEnabled),
  }
}

// 判定に使う社内ドメイン（ユーザー設定分はポリシーで禁止されていなければ合算）
export function resolveCompanyDomains(policy: ManagedPolicy, userDomains: string[]): string[] {
  const user = policy.allowUserDomains === false ? [] : userDomains
  return mergeCompanyDomains(policy.companyDomains, user)
}

// リンクチェックで信頼するドメイン（社内ドメインは常に含め、ユーザー設定分は社内ドメインと同じ条件で合算）
export function resolveTrustedLinkDomains(
  policy: ManagedPolicy,
  userTrustedDomains: string[],
  companyDomains: string[]
): string[] {
  const user = policy.allowUserDomains === false ? [] : userTrustedDomains
  return mergeCompanyDomains([...companyDomains, ...policy.trustedLinkDomains], user)
}

export interface WarningSettings {
  warningLevel: WarningLevel
  bodyCheckEnabled: boolean
}

// 判定に使う設定値（ユーザー設定とポリシーの両方で同じ形）
export interface Settings {
  companyDomains: string[]
  trustedLinkDomains: string[]
  extensionEnabled: boolean
  linkCheckEnabled: boolean
  warningSettings: WarningSettings
}

// ポリシーで配布された項目はユーザー設定より優先する
export function resolveEffectiveSettings(policy: ManagedPolicy, user: Settings): Settings {
  const companyDomains = resolveCompanyDomains(policy, user.companyDomains)
  return {
    companyDomains,
    trustedLinkDomains: resolveTrustedLinkDomains(policy, user.trustedLinkDomains, companyDomains),
    extensionEnabled: policy.extensionEnabled ?? user.extensionEnabled,
    linkCheckEnabled: policy.linkCheckEnabled ?? user.linkCheckEnabled,
    warningSettings: policy.warningLevel
      ? { warningLevel: policy.warningLevel, bodyCheckEnabled: policy.warningLevel === 'strict' }
      : user.warningSettings,
  }
}
