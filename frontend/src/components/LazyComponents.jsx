import { lazy } from 'react'

// Lazy load heavy components
export const LazyEnhancedProductsDashboard = lazy(() => import('../pages/EnhancedProductsDashboard'))
export const LazyAdminDashboard = lazy(() => import('../pages/AdminDashboard'))
export const LazyBusinessDashboard = lazy(() => import('../pages/BusinessDashboard'))
export const LazyBusinessDashboardRefactored = lazy(() => import('../pages/BusinessDashboardRefactored'))
export const LazyOrdersScreen = lazy(() => import('../pages/OrdersScreen'))
export const LazyStockKeeperDashboard = lazy(() => import('../pages/StockKeeperDashboard'))
export const LazyTenantDetails = lazy(() => import('../pages/TenantDetails'))

// Lazy load modals
export const LazyOrderDetailsModal = lazy(() => import('./OrderDetailsModal'))
export const LazyProductManagementModal = lazy(() => import('./ProductManagementModal'))
export const LazyCustomerDetailsModal = lazy(() => import('./CustomerDetailsModal'))
export const LazyAddCustomerModal = lazy(() => import('./AddCustomerModal'))
export const LazyEnhancedProductModal = lazy(() => import('./EnhancedProductModal'))
export const LazyInvoiceUploadModal = lazy(() => import('./InvoiceUploadModal'))
export const LazyProductHistoryModal = lazy(() => import('./ProductHistoryModal'))
export const LazyProductImageUpload = lazy(() => import('./ProductImageUpload'))
export const LazyPurchaseInvoiceModal = lazy(() => import('./PurchaseInvoiceModal'))
export const LazyReturnsManagement = lazy(() => import('./ReturnsManagement'))

// Lazy load forms
export const LazyClientFormDynamic = lazy(() => import('../pages/ClientFormDynamic'))
export const LazyOrderReceipt = lazy(() => import('../pages/OrderReceipt'))
