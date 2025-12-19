import { forwardRef } from 'react'
import { cn } from '../../utils/cn'

const Input = forwardRef(({ 
  className,
  type = 'text',
  error = false,
  ...props 
}, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})

Input.displayName = 'Input'

const Textarea = forwardRef(({ 
  className,
  error = false,
  ...props 
}, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})

Textarea.displayName = 'Textarea'

const Select = forwardRef(({ 
  className,
  error = false,
  children,
  ...props 
}, ref) => {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  )
})

Select.displayName = 'Select'

export { Input, Textarea, Select }
