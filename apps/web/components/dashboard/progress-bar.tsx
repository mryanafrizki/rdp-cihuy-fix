'use client'

interface ProgressBarProps {
  step: number
  totalSteps: number
  message: string
  status: 'in_progress' | 'completed' | 'failed'
}

export function ProgressBar({ step, totalSteps, message, status }: ProgressBarProps) {
  const percentage = Math.round((step / totalSteps) * 100)
  
  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-600 dark:bg-green-400'
      case 'failed':
        return 'bg-red-600 dark:bg-red-400'
      case 'in_progress':
      default:
        return 'bg-blue-600 dark:bg-blue-400'
    }
  }

  const getTextColor = () => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400'
      case 'failed':
        return 'text-red-600 dark:text-red-400'
      case 'in_progress':
      default:
        return 'text-blue-600 dark:text-blue-400'
    }
  }

  return (
    <div className="space-y-3">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className={`font-medium ${getTextColor()}`}>
            Step {step} of {totalSteps}
          </span>
          <span className="text-muted-foreground">{percentage}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${getStatusColor()}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex items-center justify-between gap-1">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((stepNum) => {
          const isCompleted = stepNum < step
          const isCurrent = stepNum === step
          const isPending = stepNum > step

          return (
            <div
              key={stepNum}
              className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                isCompleted
                  ? getStatusColor()
                  : isCurrent
                  ? `${getStatusColor()} opacity-70`
                  : 'bg-muted'
              }`}
            />
          )
        })}
      </div>

      {/* Status Message */}
      {message && (
        <div className="text-sm text-muted-foreground">
          <p>{message}</p>
        </div>
      )}

      {/* Step Numbers (for 11 steps) */}
      {totalSteps === 11 && (
        <div className="grid grid-cols-11 gap-1 text-xs text-center">
          {Array.from({ length: 11 }, (_, i) => i + 1).map((stepNum) => {
            const isCompleted = stepNum < step
            const isCurrent = stepNum === step

            return (
              <div
                key={stepNum}
                className={`transition-colors ${
                  isCompleted || isCurrent
                    ? getTextColor()
                    : 'text-muted-foreground/50'
                }`}
              >
                {stepNum}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
