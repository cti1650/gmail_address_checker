// 組織ポリシーで配布されたドメインとユーザー設定のドメインを合算する（ドメインは大文字小文字を区別しないため小文字に統一）
export function mergeCompanyDomains(managed: unknown, user: string[]): string[] {
  const managedList = Array.isArray(managed)
    ? managed.filter((d): d is string => typeof d === 'string')
    : []
  const normalized = [...managedList, ...user]
    .map(d => d.trim().toLowerCase())
    .filter(d => d.length > 0)
  return [...new Set(normalized)]
}
