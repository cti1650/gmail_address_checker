import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkLink,
  extractHostsFromText,
  getHrefHost,
  getRegistrableDomain,
  hostsMatch,
  normalizeHost,
  unwrapGoogleRedirect,
} from '../../utils/link-check'

function makeAnchor(html: string): HTMLAnchorElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  const a = wrapper.querySelector('a')
  if (!a) throw new Error('anchor not found in: ' + html)
  return a as HTMLAnchorElement
}

describe('extractHostsFromText', () => {
  it('https URLからホストを抽出する', () => {
    expect(extractHostsFromText('詳細は https://example.com/foo を参照')).toEqual(['example.com'])
  })

  it('プロトコルなしのドメインも抽出する', () => {
    expect(extractHostsFromText('example.com にアクセス')).toEqual(['example.com'])
  })

  it('複数のホストを抽出する', () => {
    const hosts = extractHostsFromText('https://a.example.com と https://b.test.org')
    expect(hosts).toContain('a.example.com')
    expect(hosts).toContain('b.test.org')
  })

  it('www.は前置詞として剥がして抽出する', () => {
    expect(extractHostsFromText('https://www.example.com/')).toEqual(['example.com'])
  })

  it('URLが含まれない文章では空配列', () => {
    expect(extractHostsFromText('詳細はこちら')).toEqual([])
  })
})

describe('normalizeHost', () => {
  it('大文字小文字を正規化', () => {
    expect(normalizeHost('Example.COM')).toBe('example.com')
  })

  it('www.を剥がす', () => {
    expect(normalizeHost('www.example.com')).toBe('example.com')
  })
})

describe('getRegistrableDomain', () => {
  it('2ラベルはそのまま返す', () => {
    expect(getRegistrableDomain('example.com')).toBe('example.com')
  })

  it('3ラベル以上は末尾2ラベルを返す', () => {
    expect(getRegistrableDomain('mail.example.com')).toBe('example.com')
    expect(getRegistrableDomain('a.b.example.com')).toBe('example.com')
  })

  it('co.jpは3ラベル目を含む', () => {
    expect(getRegistrableDomain('amazon.co.jp')).toBe('amazon.co.jp')
    expect(getRegistrableDomain('mail.amazon.co.jp')).toBe('amazon.co.jp')
  })

  it('www.は剥がす', () => {
    expect(getRegistrableDomain('www.example.com')).toBe('example.com')
  })
})

describe('hostsMatch', () => {
  it('完全一致', () => {
    expect(hostsMatch('example.com', 'example.com')).toBe(true)
  })

  it('www.の差は一致扱い', () => {
    expect(hostsMatch('www.example.com', 'example.com')).toBe(true)
  })

  it('サブドメインは一致', () => {
    expect(hostsMatch('mail.example.com', 'example.com')).toBe(true)
    expect(hostsMatch('example.com', 'mail.example.com')).toBe(true)
  })

  it('兄弟サブドメインは一致', () => {
    expect(hostsMatch('notify.amazon.com', 'support.amazon.com')).toBe(true)
    expect(hostsMatch('a.b.example.com', 'c.d.example.com')).toBe(true)
  })

  it('別ドメインは不一致', () => {
    expect(hostsMatch('evil.com', 'example.com')).toBe(false)
  })

  it('類似ドメイン (suffix偽装) は不一致', () => {
    expect(hostsMatch('evil-example.com', 'example.com')).toBe(false)
  })

  it('co.jp配下の別ドメインは不一致', () => {
    expect(hostsMatch('example.co.jp', 'another.co.jp')).toBe(false)
  })

  it('co.jp配下のサブドメインは一致', () => {
    expect(hostsMatch('mail.amazon.co.jp', 'shop.amazon.co.jp')).toBe(true)
  })

  it('TLDが違えば不一致', () => {
    expect(hostsMatch('amazon.com', 'amazon.co.jp')).toBe(false)
  })
})

describe('unwrapGoogleRedirect', () => {
  it('Gmail (google.com/url) のラッパーから実URLを抽出', () => {
    const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Factual.com%2Ffoo&sa=D'
    expect(unwrapGoogleRedirect(wrapped)).toBe('https://actual.com/foo')
  })

  it('ラッパーでなければそのまま返す', () => {
    expect(unwrapGoogleRedirect('https://example.com/')).toBe('https://example.com/')
  })

  it('不正なURLでもクラッシュしない', () => {
    expect(unwrapGoogleRedirect('not-a-url')).toBe('not-a-url')
  })
})

describe('getHrefHost', () => {
  it('httpsからホスト取得', () => {
    expect(getHrefHost('https://example.com/foo')).toBe('example.com')
  })

  it('mailto:はnull', () => {
    expect(getHrefHost('mailto:test@example.com')).toBeNull()
  })

  it('javascript:はnull', () => {
    expect(getHrefHost('javascript:alert(1)')).toBeNull()
  })

  it('不正なURLはnull', () => {
    expect(getHrefHost('not-a-url')).toBeNull()
  })
})

describe('checkLink', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('信頼するドメインへの画像リンクは関連ドメインと不一致でもスルー', () => {
    const a = makeAnchor('<a href="https://u123.ct.sendgrid.net/"><img src="x.png" alt=""></a>')
    expect(checkLink(a, ['example.com'], ['sendgrid.net']).type).toBeNull()
  })

  it('表示テキストと異なるリンク先でも信頼するドメインならスルー', () => {
    const a = makeAnchor('<a href="https://u123.ct.sendgrid.net/ls/click">https://example.com</a>')
    expect(checkLink(a, [], ['sendgrid.net']).type).toBeNull()
  })

  it('信頼するドメインでも危険なプロトコルは検知する', () => {
    const a = makeAnchor('<a href="javascript:alert(1)">sendgrid.net</a>')
    expect(checkLink(a, [], ['sendgrid.net']).type).toBe('unsafe-protocol')
  })

  it('信頼するドメイン以外への画像リンクは従来どおりunrelated', () => {
    const a = makeAnchor('<a href="https://evil.com/"><img src="x.png" alt=""></a>')
    expect(checkLink(a, ['example.com'], ['sendgrid.net']).type).toBe('unrelated')
  })

  it('画像リンクは関連ドメインが空ならスルー', () => {
    const a = makeAnchor('<a href="https://example.com/"><img src="x.png" alt=""></a>')
    document.body.appendChild(a)
    expect(checkLink(a).type).toBeNull()
  })

  it('画像リンクが関連ドメインと一致すればスルー', () => {
    const a = makeAnchor('<a href="https://example.com/"><img src="x.png" alt=""></a>')
    document.body.appendChild(a)
    expect(checkLink(a, ['example.com']).type).toBeNull()
  })

  it('画像リンクでもサブドメイン関連なら一致扱いでスルー', () => {
    const a = makeAnchor('<a href="https://mail.example.com/"><img src="x.png" alt=""></a>')
    document.body.appendChild(a)
    expect(checkLink(a, ['example.com']).type).toBeNull()
  })

  it('画像リンクが関連ドメインと不一致ならunrelated', () => {
    const a = makeAnchor('<a href="https://evil.com/"><img src="x.png" alt=""></a>')
    document.body.appendChild(a)
    const result = checkLink(a, ['example.com'])
    expect(result.type).toBe('unrelated')
    expect(result.hrefHost).toBe('evil.com')
    expect(result.relatedDomains).toEqual(['example.com'])
  })

  it('表示テキストとhrefホストが一致するならスルー', () => {
    const a = makeAnchor('<a href="https://example.com/foo">https://example.com/bar</a>')
    document.body.appendChild(a)
    expect(checkLink(a).type).toBeNull()
  })

  it('表示テキストとhrefホストが不一致ならmismatch', () => {
    const a = makeAnchor('<a href="https://evil.com/">https://amazon.com/order</a>')
    document.body.appendChild(a)
    const result = checkLink(a)
    expect(result.type).toBe('mismatch')
    expect(result.displayHost).toBe('amazon.com')
    expect(result.hrefHost).toBe('evil.com')
  })

  it('表示テキストにURL/ドメインが含まれない場合、関連ドメインが空ならスルー', () => {
    const a = makeAnchor('<a href="https://example.com/cta">詳細を見る</a>')
    document.body.appendChild(a)
    expect(checkLink(a).type).toBeNull()
    expect(checkLink(a, []).type).toBeNull()
  })

  it('ボタンリンクが関連ドメインと一致するならスルー', () => {
    const a = makeAnchor('<a href="https://example.com/cta">詳細を見る</a>')
    document.body.appendChild(a)
    expect(checkLink(a, ['example.com']).type).toBeNull()
  })

  it('ボタンリンクが関連ドメインのサブドメインでも一致扱い', () => {
    const a = makeAnchor('<a href="https://mail.example.com/cta">詳細を見る</a>')
    document.body.appendChild(a)
    expect(checkLink(a, ['example.com']).type).toBeNull()
  })

  it('ボタンリンクが関連ドメインと一致しないならunrelated', () => {
    const a = makeAnchor('<a href="https://evil.com/cta">詳細を見る</a>')
    document.body.appendChild(a)
    const result = checkLink(a, ['example.com', 'amazon.com'])
    expect(result.type).toBe('unrelated')
    expect(result.hrefHost).toBe('evil.com')
    expect(result.relatedDomains).toEqual(['example.com', 'amazon.com'])
  })

  it('Gmailリダイレクタは展開して比較', () => {
    const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Fexample.com%2F'
    const a = makeAnchor(`<a href="${wrapped}">https://example.com</a>`)
    document.body.appendChild(a)
    expect(checkLink(a).type).toBeNull()
  })

  it('サブドメインの差は一致扱い', () => {
    const a = makeAnchor('<a href="https://mail.example.com/">https://example.com</a>')
    document.body.appendChild(a)
    expect(checkLink(a).type).toBeNull()
  })

  it('mailtoはスルー', () => {
    const a = makeAnchor('<a href="mailto:foo@example.com">foo@example.com</a>')
    document.body.appendChild(a)
    expect(checkLink(a).type).toBeNull()
  })

  it('tel/smsはスルー', () => {
    const a = makeAnchor('<a href="tel:+8190123456">090-1234-56</a>')
    document.body.appendChild(a)
    expect(checkLink(a).type).toBeNull()

    const b = makeAnchor('<a href="sms:+8190123456">SMS</a>')
    document.body.appendChild(b)
    expect(checkLink(b).type).toBeNull()
  })

  it('javascript:はunsafe-protocolで警告', () => {
    const a = makeAnchor('<a href="javascript:alert(1)">クリック</a>')
    document.body.appendChild(a)
    const result = checkLink(a)
    expect(result.type).toBe('unsafe-protocol')
    expect(result.protocol).toBe('javascript')
  })

  it('data:はunsafe-protocolで警告', () => {
    const a = makeAnchor('<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">click</a>')
    document.body.appendChild(a)
    const result = checkLink(a)
    expect(result.type).toBe('unsafe-protocol')
    expect(result.protocol).toBe('data')
  })

  it('file:はunsafe-protocolで警告', () => {
    const a = makeAnchor('<a href="file:///etc/passwd">クリック</a>')
    document.body.appendChild(a)
    expect(checkLink(a).type).toBe('unsafe-protocol')
  })

  it('Gmailリダイレクタで包まれたjavascript:も検知', () => {
    const wrapped = 'https://www.google.com/url?q=javascript%3Aalert(1)'
    const a = makeAnchor(`<a href="${wrapped}">クリック</a>`)
    document.body.appendChild(a)
    const result = checkLink(a)
    expect(result.type).toBe('unsafe-protocol')
    expect(result.protocol).toBe('javascript')
  })

  it('テキスト内に複数ホストがあり1つでも不一致ならmismatch', () => {
    const a = makeAnchor('<a href="https://example.com/">https://example.com と https://evil.com</a>')
    document.body.appendChild(a)
    const result = checkLink(a)
    expect(result.type).toBe('mismatch')
    expect(result.displayHost).toBe('evil.com')
  })
})
