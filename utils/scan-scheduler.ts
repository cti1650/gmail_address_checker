// DOM 変更のたびに呼ばれる処理を間引き、同時実行を防ぐスケジューラ
// - 要求から delayMs 後に 1 回だけ実行（その間の要求はまとめる）
// - 実行中に要求が来たら、完了後にもう 1 回だけ実行する（最新の状態を取りこぼさない）
export function createScanScheduler(
  run: () => void | Promise<void>,
  delayMs: number,
  setTimer: (handler: () => void, ms: number) => unknown
): () => void {
  let scheduled = false
  let running = false
  let pending = false

  const execute = async () => {
    scheduled = false
    running = true
    try {
      await run()
    } catch {
      /* noop: 個々の処理側でエラー処理済み */
    } finally {
      running = false
      if (pending) {
        pending = false
        request()
      }
    }
  }

  const request = () => {
    if (running) {
      pending = true
      return
    }
    if (scheduled) return
    scheduled = true
    setTimer(() => {
      void execute()
    }, delayMs)
  }

  return request
}
