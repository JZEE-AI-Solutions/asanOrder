import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const Login = () => {
  const { login, user, loading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue
  } = useForm()

  // Function to copy text to clipboard
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    } catch (err) {
      toast.error('Failed to copy')
    }
  }

  // Function to fill form with demo credentials
  const fillDemoCredentials = (email, password) => {
    setValue('email', email)
    setValue('password', password)
    toast.success('Demo credentials filled!')
  }

  // Redirect if already authenticated
  if (loading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  if (user) {
    switch (user.role) {
      case 'ADMIN':
        return <Navigate to="/admin" replace />
      case 'BUSINESS_OWNER':
        return <Navigate to="/business" replace />
      case 'STOCK_KEEPER':
        return <Navigate to="/stock" replace />
      default:
        return <Navigate to="/login" replace />
    }
  }

  const onSubmit = async (data, event) => {
    event?.preventDefault()
    console.log('Login form submitted with data:', data)
    setIsLoading(true)
    try {
      console.log('Calling login function...')
      const result = await login(data.email, data.password)
      console.log('Login result:', result)
      if (result.success) {
        toast.success('Login successful!')
      } else {
        const errorMsg = typeof result.error === 'string'
          ? result.error
          : result.error?.message || 'Login failed'
        toast.error(errorMsg)
      }
    } catch (error) {
      console.error('Login error:', error)
      toast.error('Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="page-container flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="card">
          {/* Header */}
          <div className="header-gradient text-white p-6 text-center rounded-t-2xl -m-6 mb-6">
            <div className="bg-white bg-opacity-20 rounded-full p-3 mb-3 inline-block">
              <span className="text-2xl">👗</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              Order Management System
            </h2>
            <p className="text-pink-100 text-sm">
              Seamless ordering experience for custom dresses
            </p>
          </div>
          
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="form-label">
                  Email address
                </label>
                <input
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^\S+@\S+$/i,
                      message: 'Invalid email address'
                    }
                  })}
                  type="email"
                  className="input-field"
                  placeholder="Enter your email"
                />
                {errors.email && (
                  <p className="form-error">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters'
                    }
                  })}
                  type="password"
                  className="input-field"
                  placeholder="Enter your password"
                />
                {errors.password && (
                  <p className="form-error">{errors.password.message}</p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-primary flex items-center justify-center text-lg py-3"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-500 font-medium">Demo Credentials</span>
                </div>
              </div>
              
              <div className="mt-4 space-y-3 text-sm">
                <div 
                  className="bg-blue-50 border border-blue-200 rounded-lg p-3 cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => fillDemoCredentials('admin@orderms.com', 'admin123')}
                >
                  <p className="font-semibold text-blue-900 mb-1 flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    Admin Access
                  </p>
                  <p className="text-blue-700 font-mono text-xs">admin@orderms.com / admin123</p>
                  <p className="text-blue-600 text-xs mt-1">Full system access and management</p>
                </div>
                
                <div 
                  className="bg-green-50 border border-green-200 rounded-lg p-3 cursor-pointer hover:bg-green-100 transition-colors"
                  onClick={() => fillDemoCredentials('business@dressshop.com', 'business123')}
                >
                  <p className="font-semibold text-green-900 mb-1 flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Business Owner
                  </p>
                  <p className="text-green-700 font-mono text-xs">business@dressshop.com / business123</p>
                  <p className="text-green-600 text-xs mt-1">Manage orders, products, and invoices</p>
                </div>
                
                <div 
                  className="bg-purple-50 border border-purple-200 rounded-lg p-3 cursor-pointer hover:bg-purple-100 transition-colors"
                  onClick={() => fillDemoCredentials('demo@dressshop.com', 'demo123')}
                >
                  <p className="font-semibold text-purple-900 mb-1 flex items-center">
                    <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                    Demo Business
                  </p>
                  <p className="text-purple-700 font-mono text-xs">demo@dressshop.com / demo123</p>
                  <p className="text-purple-600 text-xs mt-1">Try all features with sample data</p>
                </div>
                
                <div 
                  className="bg-orange-50 border border-orange-200 rounded-lg p-3 cursor-pointer hover:bg-orange-100 transition-colors"
                  onClick={() => fillDemoCredentials('stock@orderms.com', 'stock123')}
                >
                  <p className="font-semibold text-orange-900 mb-1 flex items-center">
                    <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                    Stock Keeper
                  </p>
                  <p className="text-orange-700 font-mono text-xs">stock@orderms.com / stock123</p>
                  <p className="text-orange-600 text-xs mt-1">Inventory and stock management</p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 text-center">
                  💡 <strong>Tip:</strong> Click on any credential card to auto-fill the login form
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
