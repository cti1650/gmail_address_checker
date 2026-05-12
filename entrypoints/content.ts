import { setupSendCheck } from '../features/send-check'
import { setupLinkCheck } from '../features/link-check'

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  async main(ctx) {
    const sendCheck = setupSendCheck(ctx)
    const linkCheck = setupLinkCheck(ctx)

    const tick = () => {
      sendCheck.scan()
      void linkCheck.scan()
    }

    // Gmailの DOM 変更を監視 (context 無効化時に observer を切断)
    const observer = new MutationObserver(tick)
    observer.observe(document.body, { childList: true, subtree: true })
    ctx.onInvalidated(() => observer.disconnect())

    // フォールバックの定期チェック (ctx.setInterval は自動 cleanup)
    ctx.setInterval(tick, 1000)
  },
})
