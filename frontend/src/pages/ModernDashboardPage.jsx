import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant, useOrders, useForms, useCustomers, useOrderStats } from '../hooks';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import ModernLayout from '../components/ModernLayout';
import ModernDashboard from '../components/dashboard/ModernDashboard';
import WhatsAppConfirmationModal from '../components/WhatsAppConfirmationModal';


const ModernDashboardPage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // State


    // Hooks
    const { tenant, loading: tenantLoading } = useTenant();
    const { orders: recentOrders, loading: ordersLoading, refreshOrders } = useOrders({ limit: 5, sort: 'newest' });
    const { stats: orderStats, loading: statsLoading, refreshStats } = useOrderStats();

    // Load initial data - only run once when tenant is available
    useEffect(() => {
        if (tenant) {
            refreshOrders();
            refreshStats();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenant]); // Only depend on tenant, not the refresh functions to avoid infinite loops

    const [whatsappModal, setWhatsappModal] = useState({ isOpen: false, url: null, phone: null });

    const handleOrderConfirm = async (orderId) => {
        try {
            const response = await api.post(`/order/${orderId}/confirm`);
            refreshOrders();
            toast.success('Order confirmed successfully');
            
            // Show WhatsApp confirmation modal if URL is available
            if (response.data.whatsappUrl) {
                setWhatsappModal({
                    isOpen: true,
                    url: response.data.whatsappUrl,
                    phone: response.data.customerPhone || 'customer'
                });
            }
        } catch (error) {
            console.error('Failed to confirm order:', error);
            toast.error('Failed to confirm order');
        }
    };

    const handleWhatsAppConfirm = () => {
        if (whatsappModal.url) {
            const whatsappWindow = window.open(whatsappModal.url, '_blank', 'noopener,noreferrer');
            if (whatsappWindow) {
                toast.success('Opening WhatsApp...', { duration: 2000 });
            } else {
                toast.error('Please allow popups to open WhatsApp', { duration: 3000 });
            }
        }
        setWhatsappModal({ isOpen: false, url: null, phone: null });
    };

    const handleWhatsAppCancel = () => {
        setWhatsappModal({ isOpen: false, url: null, phone: null });
    };

    const handleOrderUpdate = () => {
        refreshOrders();
        toast.success('Order updated successfully!');
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'PENDING': return '⏳';
            case 'CONFIRMED': return '✅';
            case 'DISPATCHED': return '🚚';
            case 'COMPLETED': return '🎉';
            case 'CANCELLED': return '❌';
            default: return '📋';
        }
    };

    if (tenantLoading) {
        return <LoadingSpinner className="min-h-screen" />;
    }

    return (
        <ModernLayout>
            <ModernDashboard
                stats={orderStats}
                recentOrders={recentOrders}
                onViewOrder={(order) => navigate(`/business/orders/${order.id}`)}
                onViewAllOrders={() => navigate('/business/orders')}
                getStatusIcon={getStatusIcon}
            />

            {/* Modals */}
            <WhatsAppConfirmationModal
                isOpen={whatsappModal.isOpen}
                onClose={handleWhatsAppCancel}
                onConfirm={handleWhatsAppConfirm}
                customerPhone={whatsappModal.phone}
            />
        </ModernLayout>
    );
};

export default ModernDashboardPage;
