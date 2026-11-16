import { describe, it, expect } from 'vitest'
import { parseManagedPolicy, resolveCompanyDomains } from '../../utils/managed-policy'

describe('parseManagedPolicy', () => {
  it('ポリシー未配布ならすべて未設定', () => {
    expect(parseManagedPolicy({})).toEqual({
      companyDomains: [],
      allowUserDomains: undefined,
      warningLevel: undefined,
      extensionEnabled: undefined,
      linkCheckEnabled: undefined,
    })
  })

  it('配布された値を読み取る', () => {
    expect(parseManagedPolicy({
      companyDomains: ['corp.com'],
      allowUserDomains: false,
      warningLevel: 'strict',
      extensionEnabled: true,
      linkCheckEnabled: false,
    })).toEqual({
      companyDomains: ['corp.com'],
      allowUserDomains: false,
      warningLevel: 'strict',
      extensionEnabled: true,
      linkCheckEnabled: false,
    })
  })

  it('不正な型の値は未配布として扱う', () => {
    const policy = parseManagedPolicy({
      allowUserDomains: 'false',
      warningLevel: 'high',
      extensionEnabled: 1,
      linkCheckEnabled: null,
    })
    expect(policy.allowUserDomains).toBeUndefined()
    expect(policy.warningLevel).toBeUndefined()
    expect(policy.extensionEnabled).toBeUndefined()
    expect(policy.linkCheckEnabled).toBeUndefined()
  })
})

describe('resolveCompanyDomains', () => {
  it('既定ではポリシー配布分とユーザー設定分を合算する', () => {
    const policy = parseManagedPolicy({ companyDomains: ['corp.com'] })
    expect(resolveCompanyDomains(policy, ['user.com'])).toEqual(['corp.com', 'user.com'])
  })

  it('allowUserDomains が true なら合算する', () => {
    const policy = parseManagedPolicy({ companyDomains: ['corp.com'], allowUserDomains: true })
    expect(resolveCompanyDomains(policy, ['user.com'])).toEqual(['corp.com', 'user.com'])
  })

  it('allowUserDomains が false ならユーザー設定分を使わない', () => {
    const policy = parseManagedPolicy({ companyDomains: ['corp.com'], allowUserDomains: false })
    expect(resolveCompanyDomains(policy, ['gmail.com'])).toEqual(['corp.com'])
  })
})
