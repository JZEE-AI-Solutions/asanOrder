import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeftIcon, CogIcon, LockClosedIcon, UserIcon, BuildingOfficeIcon, PhoneIcon, TruckIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../hooks'
import CityChargesEditor from '../components/CityChargesEditor'
import QuantityRulesEditor from '../components/QuantityRulesEditor'

const SettingsPage = () => {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const { tenant, refreshTenant, updateTenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [shippingConfig, setShippingConfig] = useState({
    cityCharges: {},
    defaultCityCharge: 200,
    quantityRules: [],
    defaultQuantityCharge: 150
  })
  const [loadingShipping, setLoadingShipping] = useState(false)

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
    reset: resetProfile
  } = useForm()

  const {
    register: registerTenant,
    handleSubmit: handleTenantSubmit,
    formState: { errors: tenantErrors },
    reset: resetTenant
  } = useForm()

  useEffect(() => {
    if (user) {
      resetProfile({
        name: user.name || '',
        email: user.email || ''
      })
    }
  }, [user, resetProfile])

  useEffect(() => {
    if (tenant) {
      resetTenant({
        businessName: tenant.businessName || '',
        contactPerson: tenant.contactPerson || '',
        whatsappNumber: tenant.whatsappNumber || '',
        businessAddress: tenant.businessAddress || ''
      })
    }
    setLoading(false)
  }, [tenant, resetTenant])

  useEffect(() => {
    fetchShippingConfig()
  }, [])

  const fetchShippingConfig = async () => {
    try {
      setLoadingShipping(true)
      const response = await api.get('/shipping/config')
      if (response.data.config) {
        const config = response.data.config
        setShippingConfig({
          cityCharges: config.cityCharges || {},
          defaultCityCharge: config.defaultCityCharge || 200,
          quantityRules: config.quantityRules || [],
          defaultQuantityCharge: config.defaultQuantityCharge || 150
        })
      }
    } catch (error) {
      console.error('Error fetching shipping config:', error)
    } finally {
      setLoadingShipping(false)
    }
  }

  const handleShippingConfigSave = async () => {
    try {
      setSaving(true)
      await api.put('/shipping/config', {
        cityCharges: shippingConfig.cityCharges,
        defaultCityCharge: shippingConfig.defaultCityCharge,
        quantityRules: shippingConfig.quantityRules,
        defaultQuantityCharge: shippingConfig.defaultQuantityCharge
      })
      toast.success('Shipping configuration saved successfully!')
    } catch (error) {
      console.error('Error saving shipping config:', error)
      toast.error(error.response?.data?.error || 'Failed to save shipping configuration')
    } finally {
      setSaving(false)
    }
  }

  const onProfileSubmit = async (data) => {
    try {
      setSaving(true)
      await api.put('/auth/me', data)
      toast.success('Profile updated successfully!')
      refreshUser()
    } catch (error) {
      console.error('Profile update error:', error)
      toast.error(error.response?.data?.error || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const onTenantSubmit = async (data) => {
    try {
      setSaving(true)
      await updateTenant(data)
      toast.success('Business information updated successfully!')
    } catch (error) {
      console.error('Tenant update error:', error)
      toast.error(error.response?.data?.error || 'Failed to update business information')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    // Validate
    const errors = {}
    if (!passwordForm.currentPassword) {
      errors.currentPassword = 'Current password is required'
    }
    if (!passwordForm.newPassword) {
      errors.newPassword = 'New password is required'
    } else if (passwordForm.newPassword.length < 6) {
      errors.newPassword = 'Password must be at least 6 characters'
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }
    
    setPasswordErrors(errors)
    
    if (Object.keys(errors).length > 0) {
      return
    }

    try {
      setSaving(true)
      await api.put('/auth/me/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
      toast.success('Password changed successfully!')
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      setPasswordErrors({})
    } catch (error) {
      console.error('Password change error:', error)
      toast.error(error.response?.data?.error || 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </ModernLayout>
    )
  }

  return (
    <ModernLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/business')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div className="flex items-center">
            <div className="p-2 bg-pink-100 rounded-lg mr-3">
              <CogIcon className="h-6 w-6 text-pink-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settings</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'profile'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <UserIcon className="h-5 w-5 mr-2" />
                Profile
              </div>
            </button>
            <button
              onClick={() => setActiveTab('business')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'business'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <BuildingOfficeIcon className="h-5 w-5 mr-2" />
                Business Information
              </div>
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'password'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <LockClosedIcon className="h-5 w-5 mr-2" />
                Password
              </div>
            </button>
            <button
              onClick={() => setActiveTab('shipping')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'shipping'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <TruckIcon className="h-5 w-5 mr-2" />
                Shipping
              </div>
            </button>
          </nav>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Profile Information</h3>
            <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Full Name
                  </label>
                  <input
                    {...registerProfile('name', { required: 'Name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter your full name"
                  />
                  {profileErrors.name && (
                    <p className="text-red-500 text-sm mt-1">{profileErrors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Email Address
                  </label>
                  <input
                    {...registerProfile('email', { 
                      required: 'Email is required',
                      pattern: {
                        value: /^\S+@\S+$/i,
                        message: 'Invalid email address'
                      }
                    })}
                    type="email"
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter your email"
                  />
                  {profileErrors.email && (
                    <p className="text-red-500 text-sm mt-1">{profileErrors.email.message}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => navigate('/business')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-lg hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Saving...</span>
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Business Information Tab */}
        {activeTab === 'business' && tenant && (
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Business Information</h3>
            <form onSubmit={handleTenantSubmit(onTenantSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Business Name
                  </label>
                  <input
                    {...registerTenant('businessName', { required: 'Business name is required' })}
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter business name"
                  />
                  {tenantErrors.businessName && (
                    <p className="text-red-500 text-sm mt-1">{tenantErrors.businessName.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Contact Person
                  </label>
                  <input
                    {...registerTenant('contactPerson', { required: 'Contact person is required' })}
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter contact person name"
                  />
                  {tenantErrors.contactPerson && (
                    <p className="text-red-500 text-sm mt-1">{tenantErrors.contactPerson.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    <PhoneIcon className="h-4 w-4 inline mr-1" />
                    WhatsApp Number
                  </label>
                  <input
                    {...registerTenant('whatsappNumber', { 
                      required: 'WhatsApp number is required',
                      pattern: {
                        value: /^\+92[0-9]{10}$/,
                        message: 'Enter valid Pakistani number (+92XXXXXXXXXX)'
                      }
                    })}
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="+923001234567"
                  />
                  {tenantErrors.whatsappNumber && (
                    <p className="text-red-500 text-sm mt-1">{tenantErrors.whatsappNumber.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Business Code
                  </label>
                  <input
                    value={tenant.businessCode || 'N/A'}
                    className="w-full px-3 py-2 bg-gray-100 text-gray-600 border-2 border-gray-300 rounded-lg cursor-not-allowed"
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">Business code cannot be changed</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Business Address
                </label>
                <textarea
                  {...registerTenant('businessAddress')}
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  rows={3}
                  placeholder="Enter business address"
                />
                {tenantErrors.businessAddress && (
                  <p className="text-red-500 text-sm mt-1">{tenantErrors.businessAddress.message}</p>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => navigate('/business')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-lg hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Saving...</span>
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Password Tab */}
        {activeTab === 'password' && (
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Change Password</h3>
            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => {
                    setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                    if (passwordErrors.currentPassword) {
                      setPasswordErrors({ ...passwordErrors, currentPassword: '' })
                    }
                  }}
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="Enter current password"
                />
                {passwordErrors.currentPassword && (
                  <p className="text-red-500 text-sm mt-1">{passwordErrors.currentPassword}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => {
                      setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      if (passwordErrors.newPassword) {
                        setPasswordErrors({ ...passwordErrors, newPassword: '' })
                      }
                    }}
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter new password"
                  />
                  {passwordErrors.newPassword && (
                    <p className="text-red-500 text-sm mt-1">{passwordErrors.newPassword}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => {
                      setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      if (passwordErrors.confirmPassword) {
                        setPasswordErrors({ ...passwordErrors, confirmPassword: '' })
                      }
                    }}
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Confirm new password"
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="text-red-500 text-sm mt-1">{passwordErrors.confirmPassword}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                    setPasswordErrors({})
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-lg hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Changing...</span>
                    </>
                  ) : (
                    'Change Password'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Shipping Settings Tab */}
        {activeTab === 'shipping' && (
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Shipping Configuration</h3>
            <p className="text-sm text-gray-600 mb-6">
              Configure shipping charges based on city and product quantity. Cities not listed will use the default city charge.
            </p>

            {loadingShipping ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-8">
                {/* City-Based Charges */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4">City-Based Shipping Charges</h4>
                  <CityChargesEditor
                    charges={shippingConfig.cityCharges}
                    defaultCharge={shippingConfig.defaultCityCharge}
                    onChargesChange={(charges) => setShippingConfig(prev => ({ ...prev, cityCharges: charges }))}
                    onDefaultChange={(charge) => setShippingConfig(prev => ({ ...prev, defaultCityCharge: charge }))}
                  />
                </div>

                {/* Quantity-Based Rules */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Quantity-Based Shipping Rules</h4>
                  <QuantityRulesEditor
                    rules={shippingConfig.quantityRules}
                    defaultCharge={shippingConfig.defaultQuantityCharge}
                    onRulesChange={(rules) => setShippingConfig(prev => ({ ...prev, quantityRules: rules }))}
                    onDefaultChange={(charge) => setShippingConfig(prev => ({ ...prev, defaultQuantityCharge: charge }))}
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => navigate('/business')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleShippingConfigSave}
                    className="px-6 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-lg hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">Saving...</span>
                      </>
                    ) : (
                      'Save Shipping Configuration'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModernLayout>
  )
}

export default SettingsPage

