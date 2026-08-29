// Deadline / overdue helpers shared across the app.

export type DeadlineStatus = 'none' | 'overdue' | 'due-soon' | 'on-track' | 'done'

export interface DeadlineInfo {
  status: DeadlineStatus
  days: number // negative = overdue by N, positive = N days left
}

// `completed` orders are never overdue (the work is finished).
export function deadlineInfo(deadline: string | null | undefined, isCompleted: boolean): DeadlineInfo {
  if (!deadline) return { status: 'none', days: 0 }
  if (isCompleted) return { status: 'done', days: 0 }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline + 'T00:00:00')
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)

  if (days < 0) return { status: 'overdue', days }
  if (days <= 3) return { status: 'due-soon', days }
  return { status: 'on-track', days }
}
