import { setupSendCheck } from '../features/send-check'
import { setupLinkCheck } from '../features/link-check'
import { createScanScheduler } from '../utils/scan-scheduler'
import { watchSettingsChanges } from '../utils/storage'

// DOM 変更が続いても、各チェックはこの間隔より頻繁には実行しない
const SCAN_DELAY_MS = 300

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  async main(ctx) {
    // 設定はキャッシュし、ストレージ変更時のみ読み直す
    ctx.onInvalidated(watchSettingsChanges())

    const sendCheck = setupSendCheck(ctx)
    const linkCheck = setupLinkCheck(ctx)

    // ctx.setTimeout は context 無効化時に自動 cleanup される
    const setTimer = (handler: () => void, ms: number) => ctx.setTimeout(handler, ms)
    const requestSendScan = createScanScheduler(sendCheck.scan, SCAN_DELAY_MS, setTimer)
    const requestLinkScan = createScanScheduler(linkCheck.scan, SCAN_DELAY_MS, setTimer)
    const requestScan = () => {
      requestSendScan()
      requestLinkScan()
    }

    // Gmailの DOM 変更を監視 (context 無効化時に observer を切断)
    const observer = new MutationObserver(requestScan)
    observer.observe(document.body, { childList: true, subtree: true })
    ctx.onInvalidated(() => observer.disconnect())

    // フォールバックの定期チェック (ctx.setInterval は自動 cleanup)
    ctx.setInterval(requestScan, 1000)
  },
})
