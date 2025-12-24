import { forwardRef } from 'react'
import { cn } from '../../utils/cn'

const StatsCard = forwardRef(({
  className,
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  onClick,
  iconClassName,
  valueClassName,
  ...props
}, ref) => {
  const isClickable = !!onClick

  return (
    <div
      ref={ref}
      className={cn(
        'bg-white p-6 rounded-lg shadow-sm border border-gray-200 transition-all duration-300',
        isClickable && 'hover:shadow-xl hover:border-pink-300 cursor-pointer group',
        className
      )}
      onClick={onClick}
      {...props}
    >
      <div className="flex items-center">
        {Icon && (
          <div className={cn(
            'p-2 rounded-lg',
            isClickable && 'group-hover:scale-110 transition-transform duration-200',
            iconClassName || 'bg-pink-100 text-pink-600'
          )}>
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div className="ml-4 flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <div className="flex items-center">
            <p className={cn('text-2xl font-bold', valueClassName || 'text-gray-900')}>{value}</p>
            {trend && trendValue && (
              <span className={cn(
                'ml-2 text-sm font-medium',
                trend === 'up' ? 'text-green-600' : 'text-red-600'
              )}>
                {trend === 'up' ? '↗' : '↘'} {trendValue}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

StatsCard.displayName = 'StatsCard'

export { StatsCard }
