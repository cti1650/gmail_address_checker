import { describe, it, expect, beforeEach } from 'vitest'
import { getComposeEmails, analyzeEmailSecurity, pickMostSevere, type WarningResult } from '../../utils/email'
import { composeWindow, render } from '../fixtures/gmail'

const strict = { warningLevel: 'strict' as const, bodyCheckEnabled: true }

describe('getComposeEmails', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('作成画面の見分け方', () => {
    it('作成画面ごとに宛先と本文を分けて取得する', () => {
      render(
        composeWindow({ id: '3', to: ['a@partner.com'], from: 'me@company.com', body: 'a@partner.com 宛のご連絡です' }),
        composeWindow({ id: '4', to: ['b@other.com'], cc: ['c@company.com'], body: 'よろしくお願いします' })
      )

      const composes = getComposeEmails()

      expect(composes).toHaveLength(2)
      expect(composes[0]).toEqual({
        to: ['a@partner.com'],
        cc: [],
        bcc: [],
        from: 'me@company.com',
        body: 'a@partner.com 宛のご連絡です',
      })
      expect(composes[1]?.to).toEqual(['b@other.com'])
      expect(composes[1]?.cc).toEqual(['c@company.com'])
      expect(composes[1]?.body).toBe('よろしくお願いします')
    })

    it('最小化された作成画面の宛先も取得する', () => {
      render(
        composeWindow({ id: '3', to: ['hidden@partner.com'], minimized: true }),
        composeWindow({ id: '4', to: ['visible@company.com'] })
      )

      expect(getComposeEmails().map((c) => c.to)).toEqual([['hidden@partner.com'], ['visible@company.com']])
    })

    it('件名を入力して aria-label が変わった作成画面からも取得する', () => {
      render(composeWindow({ to: ['test@partner.com'], subject: 'テスト' }))

      expect(getComposeEmails()[0]?.to).toEqual(['test@partner.com'])
    })

    it('全画面表示で宛先欄が折りたたまれていても、要約表示と二重に数えず取得する', () => {
      render(composeWindow({ to: ['test@partner.com'], collapsedRecipients: true }))

      expect(getComposeEmails()[0]?.to).toEqual(['test@partner.com'])
    })

    it('data-compose-id がない作成画面はフォームの親要素を範囲にする', () => {
      render(composeWindow({ to: ['reply@partner.com'], body: '返信の本文', withoutComposeId: true }))

      expect(getComposeEmails()).toEqual([
        { to: ['reply@partner.com'], cc: [], bcc: [], from: '', body: '返信の本文' },
      ])
    })

    it('作成画面がなければ空配列を返す', () => {
      render('<div>受信トレイ</div>')

      expect(getComposeEmails()).toEqual([])
    })
  })

  describe('宛先', () => {
    it('有効なメールアドレスのみを抽出する', () => {
      render(composeWindow({ to: ['valid@example.com', 'invalid-email', '@domain.com', 'test.user@domain.co.jp'] }))

      expect(getComposeEmails()[0]?.to).toEqual(['valid@example.com', 'test.user@domain.co.jp'])
    })

    it('重複するメールアドレスを除去する', () => {
      render(composeWindow({ to: ['duplicate@example.com', 'duplicate@example.com', 'unique@example.com'] }))

      expect(getComposeEmails()[0]?.to).toEqual(['duplicate@example.com', 'unique@example.com'])
    })

    it('To / Cc / Bcc を分けて取得する', () => {
      render(composeWindow({ to: ['to@example.com'], cc: ['cc@example.com'], bcc: ['bcc@example.com'] }))

      const [compose] = getComposeEmails()
      expect(compose?.to).toEqual(['to@example.com'])
      expect(compose?.cc).toEqual(['cc@example.com'])
      expect(compose?.bcc).toEqual(['bcc@example.com'])
    })
  })

  describe('本文', () => {
    it('編集領域の本文を使う', () => {
      render(composeWindow({ to: ['a@partner.com'], body: '本文です' }))

      expect(getComposeEmails()[0]?.body).toBe('本文です')
    })

    it('編集領域を hidden input（HTML 文字列）より優先する', () => {
      render(composeWindow({ to: ['a@partner.com'], body: '動作確認', hiddenBody: '<div dir="ltr">動作確認</div>' }))

      expect(getComposeEmails()[0]?.body).toBe('動作確認')
    })

    it('編集領域が空なら hidden input の HTML からタグを除いた本文を使う', () => {
      // 属性内の @evil.test が本文チェックに混ざらない
      render(composeWindow({ to: ['a@partner.com'], hiddenBody: '<div>資料を送ります<img src="cid:x@evil.test"></div>' }))

      expect(getComposeEmails()[0]?.body).toBe('資料を送ります')
    })

    it('本文と uet を改行で結合する', () => {
      render(composeWindow({ to: ['external@gmail.com'], from: 'sender@company.com', body: 'メール本文です。', uet: '@gmail.com に送信します。' }))

      const [compose] = getComposeEmails()
      expect(compose?.from).toBe('sender@company.com')
      expect(compose?.body).toBe('メール本文です。\n@gmail.com に送信します。')
    })

    it.each([
      { title: '本文のみ', body: 'テスト本文', uet: '', expected: 'テスト本文' },
      { title: 'uet のみ', body: '', uet: 'UETテキスト', expected: 'UETテキスト' },
      { title: '両方空', body: '', uet: '', expected: '' },
      { title: '前後の空白は除く', body: '  本文  ', uet: '  UET  ', expected: '本文\nUET' },
    ])('本文と uet の組み合わせ: $title', ({ body, uet, expected }) => {
      render(composeWindow({ to: ['a@partner.com'], body, uet }))

      expect(getComposeEmails()[0]?.body).toBe(expected)
    })
  })
})

describe('pickMostSevere', () => {
  const item = (level: WarningResult['level'], id: string) => ({
    id,
    result: { level, message: id, detailMessage: id },
  })

  it('最も重い警告を選ぶ', () => {
    expect(pickMostSevere([item('safe', 'a'), item('high', 'b'), item('medium', 'c')])?.id).toBe('b')
  })

  it('同じ重さなら先頭を選ぶ', () => {
    expect(pickMostSevere([item('medium', 'a'), item('medium', 'b')])?.id).toBe('a')
  })

  it('空なら null を返す', () => {
    expect(pickMostSevere([])).toBeNull()
  })
})

describe('作成画面ごとの本文チェック', () => {
  it('別の作成画面の本文に書かれたドメインで警告が下がらない', () => {
    // 作成画面 A の本文に partner.com が書かれていても、作成画面 B の判定には影響しない
    render(
      composeWindow({ id: '3', to: ['a@company.com'], body: 'b@partner.com に転送します' }),
      composeWindow({ id: '4', to: ['b@partner.com'], body: '資料を送ります' })
    )

    const results = getComposeEmails().map((emails) => ({
      emails,
      result: analyzeEmailSecurity(emails, ['company.com'], strict),
    }))
    const worst = pickMostSevere(results)

    expect(results.map((r) => r.result.level)).toEqual(['safe', 'high'])
    expect(worst?.emails.to).toEqual(['b@partner.com'])
    expect(worst?.result.level).toBe('high')
  })
})

describe('閲覧画面の返信欄', () => {
  // 引用される元メールは uet に HTML で入り、見出しに元の送信者のアドレスが含まれる
  const quote = (from: string) =>
    `<div class="gmail_quote">2026年8月30日 22:43 &lt;${from}&gt;:<br><blockquote>元のメール</blockquote></div>`

  it('引用の見出しを本文としてタグなしで取り込む', () => {
    render(composeWindow({ id: '7', subject: 'Re: お知らせ', to: ['partner@partner.com'], collapsedRecipients: true, uet: quote('partner@partner.com') }))

    const [compose] = getComposeEmails()
    expect(compose?.to).toEqual(['partner@partner.com'])
    expect(compose?.body).toContain('<partner@partner.com>:')
    expect(compose?.body).toContain('元のメール')
    expect(compose?.body).not.toContain('<div')
  })

  it('返信相手のドメインは引用に含まれるため「注意」、引用にないドメインを追加すると「警告」', () => {
    render(composeWindow({ to: ['partner@partner.com'], uet: quote('partner@partner.com') }))
    const [reply] = getComposeEmails()
    expect(analyzeEmailSecurity(reply!, ['company.com'], strict).level).toBe('medium')

    render(composeWindow({ to: ['partner@partner.com', 'other@other.com'], uet: quote('partner@partner.com') }))
    const [replyWithOther] = getComposeEmails()
    expect(analyzeEmailSecurity(replyWithOther!, ['company.com'], strict).level).toBe('high')
  })
})
