import { createClient } from '@/lib/supabase/client'

export interface AuditActor {
  id?: string | null
  email?: string | null
}

// Non-blocking audit logger. Never throws (auditing must not break the action).
export async function logAudit(
  actor: AuditActor | null | undefined,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: string | null,
): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('audit_log').insert({
      user_id: actor?.id ?? null,
      user_email: actor?.email ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? null,
    })
  } catch {
    // ignore — auditing is best-effort
  }
}

// Build a human-readable "field: old -> new" summary of what changed.
export function diffDetails(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels?: Record<string, string>,
): string {
  const norm = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const pretty = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const changes: string[] = []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    const bs = norm(before[key])
    const as = norm(after[key])
    if (bs === as) continue
    const label = labels?.[key] ?? pretty(key)
    if (bs.length > 40 || as.length > 40) changes.push(label + ' (changed)')
    else changes.push(label + ': "' + bs + '" \u2192 "' + as + '"')
  }
  return changes.join(', ')
}
