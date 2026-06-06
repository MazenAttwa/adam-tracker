import type { Stage } from './types'

export const STAGES: Stage[] = [
  'draft',
  'preparation',
  'cutting_printing',
  'finishing',
  'submitted',
]

export const STAGE_ORDER: Record<Stage, number> = {
  draft: 0,
  preparation: 1,
  cutting_printing: 2,
  finishing: 3,
  submitted: 4,
}

export const NEXT_STAGE: Record<Stage, Stage | null> = {
  draft: 'preparation',
  preparation: 'cutting_printing',
  cutting_printing: 'finishing',
  finishing: 'submitted',
  submitted: null,
}

export const STAGE_COLORS: Record<Stage, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  preparation: 'bg-blue-100 text-blue-700 border-blue-300',
  cutting_printing: 'bg-purple-100 text-purple-700 border-purple-300',
  finishing: 'bg-orange-100 text-orange-700 border-orange-300',
  submitted: 'bg-green-100 text-green-700 border-green-300',
}

export const STAGE_DOT_COLORS: Record<Stage, string> = {
  draft: 'bg-gray-400',
  preparation: 'bg-blue-500',
  cutting_printing: 'bg-purple-500',
  finishing: 'bg-orange-500',
  submitted: 'bg-green-500',
}

export const STATUS_COLORS = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}
