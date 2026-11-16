import { describe, it, expect } from 'vitest'
import { mergeCompanyDomains } from '../../utils/company-domains'

describe('mergeCompanyDomains', () => {
  it('ポリシー配布分とユーザー設定分を合算する', () => {
    expect(mergeCompanyDomains(['corp.com'], ['user.com'])).toEqual(['corp.com', 'user.com'])
  })

  it('重複を除去する', () => {
    expect(mergeCompanyDomains(['corp.com', 'corp.com'], ['corp.com'])).toEqual(['corp.com'])
  })

  it('前後の空白と空文字を除去する', () => {
    expect(mergeCompanyDomains([' corp.com ', ''], ['  '])).toEqual(['corp.com'])
  })

  it('ポリシー未設定（undefined）ならユーザー設定のみ', () => {
    expect(mergeCompanyDomains(undefined, ['user.com'])).toEqual(['user.com'])
  })

  it('ポリシー値が不正な型なら文字列以外を無視する', () => {
    expect(mergeCompanyDomains('corp.com', [])).toEqual([])
    expect(mergeCompanyDomains(['corp.com', 1, null], [])).toEqual(['corp.com'])
  })
})
