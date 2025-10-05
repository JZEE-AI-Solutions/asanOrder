import { forwardRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'

const Modal = forwardRef(({ 
  isOpen = false,
  onClose,
  children,
  className,
  size = 'default',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  ...props 
}, ref) => {
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose, closeOnEscape])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    default: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4'
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      
      {/* Modal Content */}
      <div
        ref={ref}
        className={cn(
          'relative bg-white rounded-lg shadow-xl w-full',
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  )
})

Modal.displayName = 'Modal'

const ModalHeader = forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center justify-between p-6 border-b border-gray-200', className)}
    {...props}
  >
    {children}
  </div>
))

ModalHeader.displayName = 'ModalHeader'

const ModalTitle = forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold text-gray-900', className)}
    {...props}
  />
))

ModalTitle.displayName = 'ModalTitle'

const ModalBody = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('p-6', className)}
    {...props}
  />
))

ModalBody.displayName = 'ModalBody'

const ModalFooter = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center justify-end space-x-3 p-6 border-t border-gray-200', className)}
    {...props}
  />
))

ModalFooter.displayName = 'ModalFooter'

const ModalCloseButton = forwardRef(({ className, onClick, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'text-gray-400 hover:text-gray-600 transition-colors',
      className
    )}
    onClick={onClick}
    {...props}
  >
    <span className="sr-only">Close</span>
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
))

ModalCloseButton.displayName = 'ModalCloseButton'

export { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter, ModalCloseButton }
