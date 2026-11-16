import { mergeCompanyDomains } from './company-domains'

export type WarningLevel = 'off' | 'basic' | 'strict'

// 組織ポリシー（chrome.storage.managed）の値。未配布の項目は undefined
export interface ManagedPolicy {
  companyDomains: string[]
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
