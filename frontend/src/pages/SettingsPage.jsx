import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeftIcon, CogIcon, LockClosedIcon, UserIcon, BuildingOfficeIcon, PhoneIcon, TruckIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
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
  const [defaultCodFeePaidBy, setDefaultCodFeePaidBy] = useState('BUSINESS_OWNER')
  
  // Logistics companies state
  const [logisticsCompanies, setLogisticsCompanies] = useState([])
  const [loadingLogistics, setLoadingLogistics] = useState(false)
  const [showLogisticsForm, setShowLogisticsForm] = useState(false)
  const [selectedLogisticsCompany, setSelectedLogisticsCompany] = useState(null)

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
      setDefaultCodFeePaidBy(tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER')
    }
    setLoading(false)
  }, [tenant, resetTenant])

  useEffect(() => {
    fetchShippingConfig()
  }, [])

  useEffect(() => {
    if (activeTab === 'cod') {
      fetchLogisticsCompanies()
    }
  }, [activeTab])

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

  const fetchLogisticsCompanies = async () => {
    try {
      setLoadingLogistics(true)
      const response = await api.get('/accounting/logistics-companies')
      
      if (response.data?.success) {
        setLogisticsCompanies(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching logistics companies:', error)
      toast.error('Failed to load logistics companies')
    } finally {
      setLoadingLogistics(false)
    }
  }

  const handleCreateLogisticsCompany = () => {
    setSelectedLogisticsCompany(null)
    setShowLogisticsForm(true)
  }

  const handleEditLogisticsCompany = (company) => {
    setSelectedLogisticsCompany(company)
    setShowLogisticsForm(true)
  }

  const handleDeleteLogisticsCompany = async (companyId) => {
    if (!window.confirm('Are you sure you want to delete this logistics company? This action cannot be undone.')) {
      return
    }

    try {
      await api.delete(`/accounting/logistics-companies/${companyId}`)
      toast.success('Logistics company deleted successfully')
      fetchLogisticsCompanies()
    } catch (error) {
      console.error('Error deleting logistics company:', error)
      const errorMsg = error.response?.data?.error?.message || 'Failed to delete logistics company'
      toast.error(errorMsg)
    }
  }

  const handleLogisticsFormClose = () => {
    setShowLogisticsForm(false)
    setSelectedLogisticsCompany(null)
    fetchLogisticsCompanies()
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
      const errorMsg = typeof error.response?.data?.error === 'string'
        ? error.response?.data?.error
        : error.response?.data?.error?.message || 'Failed to save shipping configuration'
      toast.error(errorMsg)
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
      const errorMsg = typeof error.response?.data?.error === 'string'
        ? error.response?.data?.error
        : error.response?.data?.error?.message || 'Failed to update profile'
      toast.error(errorMsg)
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
      const errorMsg = typeof error.response?.data?.error === 'string'
        ? error.response?.data?.error
        : error.response?.data?.error?.message || 'Failed to update business information'
      toast.error(errorMsg)
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
      const errorMsg = typeof error.response?.data?.error === 'string'
        ? error.response?.data?.error
        : error.response?.data?.error?.message || 'Failed to change password'
      toast.error(errorMsg)
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
            <button
              onClick={() => setActiveTab('cod')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'cod'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                COD Fee
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

        {/* COD Fee Configuration Tab */}
        {activeTab === 'cod' && (
          <div className="space-y-6">
            {/* Section 1: Default Payment Preference */}
            <div className="card p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Default COD Fee Payment Preference</h3>
              <p className="text-sm text-gray-600 mb-6">
                Set the default payment preference for COD fees. This will be used when confirming orders unless you specify otherwise for individual orders.
              </p>

              <div className="space-y-4">
                <div>
                  <div className="space-y-3">
                    <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                      style={{ borderColor: defaultCodFeePaidBy === 'BUSINESS_OWNER' ? '#ec4899' : '#e5e7eb' }}>
                      <input
                        type="radio"
                        name="defaultCodFeePaidBy"
                        value="BUSINESS_OWNER"
                        checked={defaultCodFeePaidBy === 'BUSINESS_OWNER'}
                        onChange={(e) => setDefaultCodFeePaidBy(e.target.value)}
                        className="mt-1 mr-3 h-4 w-4 text-pink-600 focus:ring-pink-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Business Owner Pays</div>
                        <p className="text-sm text-gray-600 mt-1">
                          COD fee is treated as an expense. The order total does not include the COD fee. This is the default option.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                      style={{ borderColor: defaultCodFeePaidBy === 'CUSTOMER' ? '#ec4899' : '#e5e7eb' }}>
                      <input
                        type="radio"
                        name="defaultCodFeePaidBy"
                        value="CUSTOMER"
                        checked={defaultCodFeePaidBy === 'CUSTOMER'}
                        onChange={(e) => setDefaultCodFeePaidBy(e.target.value)}
                        className="mt-1 mr-3 h-4 w-4 text-pink-600 focus:ring-pink-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Customer Pays</div>
                        <p className="text-sm text-gray-600 mt-1">
                          COD fee is added to the order total as revenue. The customer pays the COD fee along with the order amount.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> This setting only affects the default behavior. You can still override this preference for individual orders when confirming them.
                  </p>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setSaving(true)
                        await updateTenant({ defaultCodFeePaidBy })
                        toast.success('COD fee configuration saved successfully!')
                      } catch (error) {
                        console.error('COD fee config save error:', error)
                        const errorMsg = typeof error.response?.data?.error === 'string'
                          ? error.response?.data?.error
                          : error.response?.data?.error?.message || 'Failed to save COD fee configuration'
                        toast.error(errorMsg)
                      } finally {
                        setSaving(false)
                      }
                    }}
                    className="px-6 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-lg hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">Saving...</span>
                      </>
                    ) : (
                      'Save Payment Preference'
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Logistics Companies Management */}
            <div className="card p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Logistics Companies</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage logistics companies and their COD fee calculation methods (Percentage, Range-Based, or Fixed)
                  </p>
                </div>
                <button
                  onClick={handleCreateLogisticsCompany}
                  className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors min-h-[44px] text-sm font-medium"
                >
                  Add Company
                </button>
              </div>

              {loadingLogistics ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          COD Fee Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fee Details
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {logisticsCompanies.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                            No logistics companies found. Click "Add Company" to create one.
                          </td>
                        </tr>
                      ) : (
                        logisticsCompanies.map((company) => {
                          let feeDetails = 'N/A'
                          if (company.codFeeCalculationType === 'PERCENTAGE') {
                            feeDetails = `${company.codFeePercentage}%`
                          } else if (company.codFeeCalculationType === 'FIXED') {
                            feeDetails = `Rs. ${company.fixedCodFee}`
                          } else if (company.codFeeCalculationType === 'RANGE_BASED') {
                            try {
                              const rules = JSON.parse(company.codFeeRules || '[]')
                              feeDetails = `${rules.length} range${rules.length !== 1 ? 's' : ''}`
                            } catch (e) {
                              feeDetails = 'Range-based'
                            }
                          }

                          return (
                            <tr key={company.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {company.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {company.phone || company.email || 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                  {company.codFeeCalculationType?.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {feeDetails}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  company.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {company.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditLogisticsCompany(company)}
                                    className="text-blue-600 hover:text-blue-800 min-h-[44px] min-w-[44px]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLogisticsCompany(company.id)}
                                    className="text-red-600 hover:text-red-800 min-h-[44px] min-w-[44px]"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Logistics Company Form Modal */}
            {showLogisticsForm && (
              <LogisticsCompanyFormModal
                company={selectedLogisticsCompany}
                onClose={handleLogisticsFormClose}
              />
            )}
          </div>
        )}
      </div>
    </ModernLayout>
  )
}

// Logistics Company Form Modal Component
function LogisticsCompanyFormModal({ company, onClose }) {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    address: '',
    email: '',
    phone: '',
    codFeeCalculationType: 'PERCENTAGE',
    codFeePercentage: '',
    fixedCodFee: '',
    codFeeRules: []
  })

  useEffect(() => {
    if (company) {
      let rules = []
      try {
        rules = company.codFeeRules ? JSON.parse(company.codFeeRules) : []
      } catch (e) {
        rules = []
      }

      setFormData({
        name: company.name || '',
        contact: company.contact || '',
        address: company.address || '',
        email: company.email || '',
        phone: company.phone || '',
        codFeeCalculationType: company.codFeeCalculationType || 'PERCENTAGE',
        codFeePercentage: company.codFeePercentage?.toString() || '',
        fixedCodFee: company.fixedCodFee?.toString() || '',
        codFeeRules: rules
      })
    }
  }, [company])

  const handleAddRangeRule = () => {
    setFormData(prev => ({
      ...prev,
      codFeeRules: [...prev.codFeeRules, { min: '', max: '', fee: '' }]
    }))
  }

  const handleRemoveRangeRule = (index) => {
    setFormData(prev => ({
      ...prev,
      codFeeRules: prev.codFeeRules.filter((_, i) => i !== index)
    }))
  }

  const handleUpdateRangeRule = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      codFeeRules: prev.codFeeRules.map((rule, i) => 
        i === index ? { ...rule, [field]: value } : rule
      )
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name || !formData.codFeeCalculationType) {
      toast.error('Name and COD fee calculation type are required')
      return
    }

    if (formData.codFeeCalculationType === 'PERCENTAGE' && !formData.codFeePercentage) {
      toast.error('COD fee percentage is required')
      return
    }

    if (formData.codFeeCalculationType === 'FIXED' && !formData.fixedCodFee) {
      toast.error('Fixed COD fee is required')
      return
    }

    if (formData.codFeeCalculationType === 'RANGE_BASED' && formData.codFeeRules.length === 0) {
      toast.error('At least one range rule is required')
      return
    }

    // Validate range rules
    if (formData.codFeeCalculationType === 'RANGE_BASED') {
      const rules = formData.codFeeRules.map(rule => ({
        min: parseFloat(rule.min),
        max: parseFloat(rule.max),
        fee: parseFloat(rule.fee)
      }))
      
      // Check for gaps and overlaps
      const sortedRules = [...rules].sort((a, b) => a.min - b.min)
      for (let i = 0; i < sortedRules.length; i++) {
        if (sortedRules[i].min >= sortedRules[i].max) {
          toast.error(`Range ${i + 1}: Min must be less than Max`)
          return
        }
        if (i > 0 && sortedRules[i].min !== sortedRules[i - 1].max) {
          toast.error(`Range ${i + 1}: Must start where previous range ends (no gaps allowed)`)
          return
        }
      }
    }

    try {
      setLoading(true)
      
      const submitData = {
        name: formData.name,
        contact: formData.contact,
        address: formData.address,
        email: formData.email,
        phone: formData.phone,
        codFeeCalculationType: formData.codFeeCalculationType,
        codFeePercentage: formData.codFeePercentage ? parseFloat(formData.codFeePercentage) : null,
        fixedCodFee: formData.fixedCodFee ? parseFloat(formData.fixedCodFee) : null,
        codFeeRules: formData.codFeeCalculationType === 'RANGE_BASED' ? formData.codFeeRules.map(rule => ({
          min: parseFloat(rule.min),
          max: parseFloat(rule.max),
          fee: parseFloat(rule.fee)
        })) : null
      }

      if (company) {
        await api.put(`/accounting/logistics-companies/${company.id}`, submitData)
        toast.success('Logistics company updated successfully')
      } else {
        await api.post('/accounting/logistics-companies', submitData)
        toast.success('Logistics company created successfully')
      }

      onClose()
    } catch (error) {
      console.error('Error saving logistics company:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to save logistics company')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {company ? 'Edit Logistics Company' : 'Add Logistics Company'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                COD Fee Calculation Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.codFeeCalculationType}
                onChange={(e) => setFormData(prev => ({ ...prev, codFeeCalculationType: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
              >
                <option value="PERCENTAGE">Percentage (e.g., TCS: 4% of COD amount)</option>
                <option value="RANGE_BASED">Range-Based (e.g., Pakistan Post: Rs. 75 for &lt;10K, different for 10K-20K)</option>
                <option value="FIXED">Fixed (Fixed amount regardless of COD amount)</option>
              </select>
            </div>

            {formData.codFeeCalculationType === 'PERCENTAGE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  COD Fee Percentage <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.codFeePercentage}
                  onChange={(e) => setFormData(prev => ({ ...prev, codFeePercentage: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                  placeholder="e.g., 4"
                />
                <p className="mt-1 text-xs text-gray-500">Percentage of COD amount (e.g., 4 for 4%)</p>
              </div>
            )}

            {formData.codFeeCalculationType === 'FIXED' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fixed COD Fee <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fixedCodFee}
                  onChange={(e) => setFormData(prev => ({ ...prev, fixedCodFee: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                  placeholder="e.g., 50"
                />
                <p className="mt-1 text-xs text-gray-500">Fixed amount regardless of COD amount</p>
              </div>
            )}

            {formData.codFeeCalculationType === 'RANGE_BASED' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  COD Fee Rules <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {formData.codFeeRules.map((rule, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 mb-1">Min Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.min}
                          onChange={(e) => handleUpdateRangeRule(index, 'min', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                          placeholder="Min"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 mb-1">Max Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.max}
                          onChange={(e) => handleUpdateRangeRule(index, 'max', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                          placeholder="Max"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 mb-1">Fee</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.fee}
                          onChange={(e) => handleUpdateRangeRule(index, 'fee', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                          placeholder="Fee"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveRangeRule(index)}
                        className="px-3 py-2 text-red-600 hover:text-red-800 min-h-[44px] min-w-[44px]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddRangeRule}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                  >
                    + Add Range Rule
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Define ranges with fixed fees. Ranges must be continuous (no gaps). Example: 0-10000 = Rs. 75, 10000-20000 = Rs. 100</p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {loading ? 'Saving...' : company ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage

