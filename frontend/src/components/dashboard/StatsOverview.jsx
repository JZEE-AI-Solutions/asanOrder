import { StatsCard } from '../ui/StatsCard'
import { 
  DocumentTextIcon, 
  ShoppingBagIcon,
  CheckIcon,
  ClockIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'

const StatsOverview = ({ stats, forms, onStatClick }) => {
  const statCards = [
    {
      title: 'Active Forms',
      value: forms.length,
      icon: DocumentTextIcon,
      onClick: null
    },
    {
      title: 'Total Orders',
      value: stats?.totalOrders || 0,
      icon: ShoppingBagIcon,
      onClick: () => onStatClick('all')
    },
    {
      title: 'Pending',
      value: stats?.pendingOrders || 0,
      icon: ClockIcon,
      onClick: () => onStatClick('PENDING')
    },
    {
      title: 'Confirmed',
      value: stats?.confirmedOrders || 0,
      icon: CheckIcon,
      onClick: () => onStatClick('CONFIRMED')
    }
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
      {statCards.map((card, index) => (
        <StatsCard
          key={index}
          title={card.title}
          value={card.value}
          icon={card.icon}
          onClick={card.onClick}
          className={card.onClick ? 'hover:shadow-xl hover:border-pink-300 cursor-pointer group' : ''}
        >
          {card.onClick && (
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-pink-500" />
          )}
        </StatsCard>
      ))}
    </div>
  )
}

export default StatsOverview
