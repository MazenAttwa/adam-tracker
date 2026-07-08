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
  const changes: string[] = []
  for (const key of Object.keys(after)) {
    const b = before[key]
    const a = after[key]
    const bs = b === null || b === undefined ? '' : String(b)
    const as = a === null || a === undefined ? '' : String(a)
    if (bs !== as) {
      const label = labels?.[key] ?? key
      changes.push(label + ': "' + bs + '" \u2192 "' + as + '"')
    }
  }
  return changes.join(', ')
}
