'use client'
import { useLang } from '@/contexts/LanguageContext'
import { STAGES, STAGE_ORDER } from '@/lib/stageConfig'
import type { Stage } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StageProgressProps {
  currentStage: Stage
  onStageClick?: (stage: Stage) => void
  activeTab?: Stage
  completedStages?: Stage[]
}

export function StageProgress({ currentStage, onStageClick, activeTab, completedStages = [] }: StageProgressProps) {
  const { tr } = useLang()
  const currentIndex = STAGE_ORDER[currentStage]

  const stageShortKeys: Record<Stage, string> = {
    draft: tr.draft_short,
    preparation: tr.preparation_short,
    cutting: tr.cutting_short,
    printing: tr.printing_short,
    finishing: tr.finishing_short,
    submitted: tr.submitted_short,
  }

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex items-center min-w-max">
        {STAGES.map((stage, i) => {
          const isDone = completedStages.includes(stage) || STAGE_ORDER[stage] < currentIndex
          const isCurrent = stage === currentStage
          const isActive = stage === activeTab
          const isReachable = STAGE_ORDER[stage] <= currentIndex

          return (
            <div key={stage} className="flex items-center">
              <button
                onClick={() => onStageClick?.(stage)}
                disabled={!isReachable}
                className={cn(
                  'flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-all',
                  onStageClick && isReachable ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default',
                  isActive && 'bg-[#0f1b35]/5'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                  isDone && 'bg-green-500 border-green-500 text-white',
                  isCurrent && !isDone && 'bg-[#c9a84c] border-[#c9a84c] text-white shadow-md scale-110',
                  !isCurrent && !isDone && 'bg-white border-gray-300 text-gray-400',
                  isActive && !isCurrent && !isDone && 'border-[#0f1b35] text-[#0f1b35]',
                )}>
                  {isDone ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isCurrent ? 'text-[#c9a84c]' : isDone ? 'text-green-600' : 'text-gray-400'
                )}>
                  {stageShortKeys[stage]}
                </span>
              </button>

              {i < STAGES.length - 1 && (
                <div className={cn(
                  'h-0.5 w-6 sm:w-10 mx-0.5 rounded transition-all',
                  STAGE_ORDER[STAGES[i + 1]] <= currentIndex ? 'bg-green-400' : 'bg-gray-200'
                )} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
