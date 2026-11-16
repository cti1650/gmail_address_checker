// Gmail の DOM を簡潔に再現するテスト用の再現データ
//
// 実際の Gmail の画面（2026 年 11 月時点）から、拡張機能が依存する属性だけを残して簡略化したもの。
// 拡張機能は短縮クラス名に依存しないため、クラス名は構造の目印として残すだけで判定には使わない。

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export interface ComposeOptions {
  /** data-compose-id の値 */
  id?: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  from?: string
  /** 本文の編集領域（[role=textbox][contenteditable]）の中身 */
  body?: string
  /** hidden input[name=body] の value（Gmail では空、または HTML 文字列のことがある） */
  hiddenBody?: string
  /** hidden input[name=uet] の value（返信時は引用される元メールの HTML） */
  uet?: string
  /** 件名。指定すると作成画面の aria-label が「新規メッセージ」から件名に変わる */
  subject?: string
  /** 最小化された作成画面（中身が display: none） */
  minimized?: boolean
  /** 全画面表示などで宛先欄が折りたたまれ、要約表示（[email][data-hovercard-id]）が出ている状態 */
  collapsedRecipients?: boolean
  /** data-compose-id のない作成画面（フォームの親要素が範囲になる） */
  withoutComposeId?: boolean
}

// 宛先のチップ（[name=to] 内の [role=option][data-hovercard-id]）
function recipientChips(emails: string[]): string {
  return emails
    .map((email) => `<div class="agh"><div role="option" data-hovercard-id="${escapeAttr(email)}" data-name=""><span>${email}</span></div></div>`)
    .join('')
}

function recipientField(name: 'to' | 'cc' | 'bcc', emails: string[]): string {
  const label = { to: 'To', cc: 'Cc', bcc: 'Bcc' }[name]
  return `<div name="${name}" aria-label="${label}"><div role="listbox" aria-label="検索フィールド">${recipientChips(emails)}<input aria-label="${label} の宛先"></div></div>`
}

/** メールの作成画面（新規作成・返信欄・全画面表示に共通の構造） */
export function composeWindow(options: ComposeOptions = {}): string {
  const to = options.to ?? []
  const summary = options.collapsedRecipients
    ? `<div class="aoD hl">${to.map((email) => `<span email="${escapeAttr(email)}" data-hovercard-id="${escapeAttr(email)}">${email}</span>`).join('')}</div>`
    : ''
  const inner = `
    <table><tbody><tr><td class="I5">
      <form method="POST" enctype="multipart/form-data">
        <div class="fX" ${options.collapsedRecipients ? 'style="display: none;"' : ''}>
          ${recipientField('to', to)}
          ${recipientField('cc', options.cc ?? [])}
          ${recipientField('bcc', options.bcc ?? [])}
        </div>
        ${summary}
        <input type="hidden" name="from" value="${escapeAttr(options.from ?? '')}">
        <input type="hidden" name="body" value="${escapeAttr(options.hiddenBody ?? '')}">
        <input type="hidden" name="uet" value="${escapeAttr(options.uet ?? '')}">
      </form>
      <table class="iN"><tbody><tr><td>
        <div role="textbox" contenteditable="true" aria-label="メッセージ本文">${options.body ?? '<br>'}</div>
      </td></tr></tbody></table>
    </td></tr></tbody></table>
  `
  const region = options.withoutComposeId
    ? `<div class="reply">${inner}</div>`
    : `<div role="region" data-compose-id="${escapeAttr(options.id ?? '1')}" aria-label="${escapeAttr(options.subject ?? '新規メッセージ')}">${inner}</div>`
  return `
    <div role="dialog">
      <div ${options.minimized ? 'style="display: none;"' : ''}>${region}</div>
    </div>
  `
}

export interface MessageOptions {
  /** data-message-id の値 */
  id?: string
  /** 送信者（[email] 属性） */
  from: string
  /** 受信者（[email] 属性） */
  to?: string[]
  /** 本文中のリンク */
  links: { href: string; text: string }[]
  /** HTML メールの本文に付く [vlink] 要素で本文を囲むか（プレーンテキストのメールにはない） */
  vlink?: boolean
}

/** 閲覧画面で開いた受信メール 1 通 */
export function receivedMessage(options: MessageOptions): string {
  const links = options.links
    .map((link) => `<a href="${escapeAttr(link.href)}">${link.text}</a>`)
    .join('')
  const body = options.vlink ? `<div vlink="#551A8B">${links}</div>` : links
  return `
    <div class="adn" data-message-id="${escapeAttr(options.id ?? '#msg-f:1')}">
      <div class="gE">
        <span email="${escapeAttr(options.from)}" class="gD">${options.from}</span>
        <span class="hb">To ${(options.to ?? []).map((email) => `<span email="${escapeAttr(email)}" class="g2">${email}</span>`).join('')}</span>
      </div>
      <div class="ii gt"><div class="a3s">${body}</div></div>
    </div>
  `
}

/** 再現データを document.body に描画する */
export function render(...html: string[]): void {
  document.body.innerHTML = html.join('')
}
