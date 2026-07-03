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