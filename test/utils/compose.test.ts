import { describe, it, expect, beforeEach } from 'vitest'
import { getComposeEmails, analyzeEmailSecurity, pickMostSevere, type WarningResult } from '../../utils/email'

// 実際の Gmail の作成画面の構造を簡略化したもの（2025 年時点の DOM を参考）
// - 作成画面ごとに [role=region][data-compose-id] があり、宛先欄・hidden input・本文の編集領域を含む
// - 本文の編集領域は form の外（同じ td 内の table）にある
// - hidden input[name=body] は空のことがある
// - 宛先は [name=to] 内の [role=option][data-hovercard-id] のチップ
// - 件名を入力すると作成画面の aria-label が「新規メッセージ」から件名に変わる
function composeHtml(options: {
  id: string
  to: string[]
  cc?: string[]
  body: string
  minimized?: boolean
  subject?: string
}): string {
  const chips = (emails: string[]) =>
    emails
      .map((email) => `<div class="agh"><div role="option" class="afV" data-hovercard-id="${email}" data-name=""><span>${email}</span></div></div>`)
      .join('')
  return `
    <div class="nH Hd" role="dialog">
      <div class="nH" ${options.minimized ? 'style="display: none;"' : ''}>
        <div class="aoI" role="region" data-compose-id="${options.id}" aria-label="${options.subject ?? '新規メッセージ'}">
          <table><tbody><tr><td class="I5">
            <form method="POST" enctype="multipart/form-data">
              <div name="to" aria-label="To"><div class="afp"><div role="listbox" aria-label="検索フィールド">${chips(options.to)}<input aria-label="To の宛先"></div></div></div>
              <div name="cc" aria-label="Cc"><div class="afp">${chips(options.cc ?? [])}</div></div>
              <div name="bcc" aria-label="Bcc"><div class="afp"></div></div>
              <input type="hidden" name="from" value="me@company.com">
              <input type="hidden" name="body" value="">
              <input type="hidden" name="uet" value="">
            </form>
            <table class="iN"><tbody><tr><td>
              <div role="textbox" contenteditable="true" aria-label="メッセージ本文">${options.body}</div>
            </td></tr></tbody></table>
          </td></tr></tbody></table>
        </div>
      </div>
    </div>
  `
}

describe('getComposeEmails', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('作成画面ごとに宛先と本文を分けて取得する', () => {
    document.body.innerHTML =
      composeHtml({ id: '3', to: ['a@partner.com'], body: 'a@partner.com 宛のご連絡です' }) +
      composeHtml({ id: '4', to: ['b@other.com'], cc: ['c@company.com'], body: 'よろしくお願いします' })

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
    document.body.innerHTML =
      composeHtml({ id: '3', to: ['hidden@partner.com'], body: '', minimized: true }) +
      composeHtml({ id: '4', to: ['visible@company.com'], body: '' })

    const composes = getComposeEmails()

    expect(composes.map((c) => c.to)).toEqual([['hidden@partner.com'], ['visible@company.com']])
  })

  it('件名を入力して aria-label が変わった作成画面からも取得する', () => {
    document.body.innerHTML = composeHtml({ id: '6', to: ['test@partner.com'], body: '', subject: 'テスト' })

    expect(getComposeEmails()[0]?.to).toEqual(['test@partner.com'])
  })

  it('hidden input の本文が空なら編集領域の本文を使う', () => {
    document.body.innerHTML = composeHtml({ id: '3', to: ['a@partner.com'], body: '本文です' })

    expect(getComposeEmails()[0]?.body).toBe('本文です')
  })

  it('data-compose-id がない作成画面はフォームの親要素を範囲にする', () => {
    document.body.innerHTML = `
      <div class="reply">
        <form><div name="to"><div data-hovercard-id="reply@partner.com"></div></div></form>
        <div role="textbox" contenteditable="true">返信の本文</div>
      </div>
    `

    expect(getComposeEmails()).toEqual([
      { to: ['reply@partner.com'], cc: [], bcc: [], from: '', body: '返信の本文' },
    ])
  })

  it('全画面表示で宛先欄が折りたたまれていても、宛先を二重に数えず取得する', () => {
    // 宛先欄（.fX）は非表示になり、要約表示に [email][data-hovercard-id] の span が出る
    document.body.innerHTML = `
      <div class="aSs"><div class="aSt">
        <div role="region" data-compose-id="6" aria-label="テスト">
          <table><tbody><tr><td class="I5">
            <form>
              <div class="fX" style="display: none;">
                <div name="to" aria-label="To"><div role="option" data-hovercard-id="test@partner.com"></div></div>
              </div>
              <div class="aoD hl"><div class="oL"><span email="test@partner.com" data-hovercard-id="test@partner.com">test@partner.com</span></div></div>
              <input type="hidden" name="body" value="&lt;div dir=&quot;ltr&quot;&gt;動作確認&lt;/div&gt;">
            </form>
            <table class="iN"><tbody><tr><td>
              <div role="textbox" contenteditable="true">動作確認</div>
            </td></tr></tbody></table>
          </td></tr></tbody></table>
        </div>
      </div></div>
    `

    const [compose] = getComposeEmails()
    expect(compose?.to).toEqual(['test@partner.com'])
    expect(compose?.body).toBe('動作確認')
  })

  it('編集領域がなく hidden input に HTML が入っている場合はタグを除いた本文を使う', () => {
    document.body.innerHTML = `
      <div role="region" data-compose-id="7">
        <form>
          <div name="to"><div data-hovercard-id="a@partner.com"></div></div>
          <input type="hidden" name="body" value="&lt;div&gt;資料を送ります&lt;img src=&quot;cid:x@evil.test&quot;&gt;&lt;/div&gt;">
        </form>
      </div>
    `

    expect(getComposeEmails()[0]?.body).toBe('資料を送ります')
  })

  it('作成画面がなければ空配列を返す', () => {
    document.body.innerHTML = '<div>受信トレイ</div>'

    expect(getComposeEmails()).toEqual([])
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
  const settings = { warningLevel: 'strict' as const, bodyCheckEnabled: true }

  it('別の作成画面の本文に書かれたドメインで警告が下がらない', () => {
    // 作成画面 A の本文に partner.com が書かれていても、作成画面 B の判定には影響しない
    document.body.innerHTML =
      composeHtml({ id: '3', to: ['a@company.com'], body: 'b@partner.com に転送します' }) +
      composeHtml({ id: '4', to: ['b@partner.com'], body: '資料を送ります' })

    const results = getComposeEmails().map((emails) => ({
      emails,
      result: analyzeEmailSecurity(emails, ['company.com'], settings),
    }))
    const worst = pickMostSevere(results)

    expect(results.map((r) => r.result.level)).toEqual(['safe', 'high'])
    expect(worst?.emails.to).toEqual(['b@partner.com'])
    expect(worst?.result.level).toBe('high')
  })
})

describe('閲覧画面の返信欄', () => {
  // 実際の Gmail の返信欄の構造を簡略化したもの
  // - 返信欄も [role=region][data-compose-id] で、aria-label は「Re: 件名」
  // - 引用される元メールは hidden input[name=uet] に HTML で入り、見出しに元の送信者のアドレスが含まれる
  // - 本文の編集領域は、引用が折りたたまれている間は空
  const replyHtml = (to: string[], quotedFrom: string) => `
    <div role="region" data-compose-id="7" aria-label="Re: お知らせ">
      <table><tbody><tr><td class="I5">
        <form>
          <div name="to" aria-label="To">${to.map((email) => `<div role="option" data-hovercard-id="${email}"></div>`).join('')}</div>
          <div class="aoD hl"><span email="${to[0]}" data-hovercard-id="${to[0]}">${to[0]}</span></div>
          <input type="hidden" name="body" value="">
          <input type="hidden" name="uet" value="&lt;div class=&quot;gmail_quote&quot;&gt;2026年8月30日 22:43 &amp;lt;${quotedFrom}&amp;gt;:&lt;br&gt;&lt;blockquote&gt;元のメール&lt;/blockquote&gt;&lt;/div&gt;">
        </form>
        <table class="iN"><tbody><tr><td><div role="textbox" contenteditable="true"><br></div></td></tr></tbody></table>
      </td></tr></tbody></table>
    </div>
  `
  const settings = { warningLevel: 'strict' as const, bodyCheckEnabled: true }

  it('引用の見出しを本文としてタグなしで取り込む', () => {
    document.body.innerHTML = replyHtml(['partner@partner.com'], 'partner@partner.com')

    const [compose] = getComposeEmails()
    expect(compose?.to).toEqual(['partner@partner.com'])
    expect(compose?.body).toContain('<partner@partner.com>:')
    expect(compose?.body).toContain('元のメール')
    expect(compose?.body).not.toContain('<div')
  })

  it('返信相手のドメインは引用に含まれるため「注意」、引用にないドメインを追加すると「警告」', () => {
    document.body.innerHTML = replyHtml(['partner@partner.com'], 'partner@partner.com')
    const [reply] = getComposeEmails()
    expect(analyzeEmailSecurity(reply!, ['company.com'], settings).level).toBe('medium')

    document.body.innerHTML = replyHtml(['partner@partner.com', 'other@other.com'], 'partner@partner.com')
    const [replyWithOther] = getComposeEmails()
    expect(analyzeEmailSecurity(replyWithOther!, ['company.com'], settings).level).toBe('high')
  })
})
