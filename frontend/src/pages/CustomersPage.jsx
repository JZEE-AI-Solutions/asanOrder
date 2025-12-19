import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks';
import api from '../services/api';
import ModernLayout from '../components/ModernLayout';
import CustomersSection from '../components/dashboard/CustomersSection';
import LoadingSpinner from '../components/LoadingSpinner';

const CustomersPage = () => {
    const navigate = useNavigate();
    const { customers, loading: customersLoading, refreshCustomers } = useCustomers();
    const [customerSearch, setCustomerSearch] = useState('');
    const [filterPendingPayments, setFilterPendingPayments] = useState(false);
    const [customerStats, setCustomerStats] = useState(null);

    const fetchCustomerStats = useCallback(async () => {
        try {
            const response = await api.get('/customer/stats/overview');
            setCustomerStats(response.data.stats);
        } catch (error) {
            console.error('Failed to fetch customer stats:', error);
        }
    }, []);

    useEffect(() => {
        refreshCustomers({ 
            search: customerSearch,
            hasPendingPayment: filterPendingPayments
        });
        fetchCustomerStats();
    }, [refreshCustomers, fetchCustomerStats, customerSearch, filterPendingPayments]);

    const handleCustomerSearch = (searchTerm) => {
        setCustomerSearch(searchTerm);
        refreshCustomers({ 
            search: searchTerm,
            hasPendingPayment: filterPendingPayments
        });
    };

    const handleFilterChange = (hasPending) => {
        setFilterPendingPayments(hasPending);
        refreshCustomers({ 
            search: customerSearch,
            hasPendingPayment: hasPending
        });
    };

    const handleCustomerClick = (customer) => {
        navigate(`/business/customers/${customer.id}`);
    };

    const handleAddCustomer = () => {
        navigate('/business/customers/new');
    };

    if (customersLoading && !customers.length) {
        return <LoadingSpinner className="min-h-screen" />;
    }

    return (
        <ModernLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-brand-600">Customers</h1>
                    <p className="text-gray-500 mt-1">Manage your customer base and view their history.</p>
                </div>

                <CustomersSection
                    customers={customers}
                    customerStats={customerStats}
                    customerLoading={customersLoading}
                    customerSearch={customerSearch}
                    onSearchChange={handleCustomerSearch}
                    onAddCustomer={handleAddCustomer}
                    onRefreshCustomers={() => refreshCustomers({ 
                        search: customerSearch,
                        hasPendingPayment: filterPendingPayments
                    })}
                    onCustomerClick={handleCustomerClick}
                    filterPendingPayments={filterPendingPayments}
                    onFilterChange={handleFilterChange}
                />
            </div>
        </ModernLayout>
    );
};

export default CustomersPage;
