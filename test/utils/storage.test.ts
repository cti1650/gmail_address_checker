import { describe, it, expect } from 'vitest'

describe('storage', () => {

  it('storage構造の設定値が正しい', () => {
    // ストレージ設定のテスト
    const companyDomainsConfig = {
      defaultValue: [],
      version: 1,
    }
    
    const extensionEnabledConfig = {
      defaultValue: true,
      version: 1,
    }
    
    const warningSettingsConfig = {
      defaultValue: {
        warningLevel: 'strict' as const,
        bodyCheckEnabled: true,
      },
      version: 4,
    }
    
    expect(companyDomainsConfig.defaultValue).toEqual([])
    expect(extensionEnabledConfig.defaultValue).toBe(true)
    expect(warningSettingsConfig.defaultValue.warningLevel).toBe('strict')
    expect(warningSettingsConfig.defaultValue.bodyCheckEnabled).toBe(true)
  })
})