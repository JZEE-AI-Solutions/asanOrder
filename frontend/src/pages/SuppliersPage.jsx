import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import ModernLayout from '../components/ModernLayout';
import SuppliersSection from '../components/dashboard/SuppliersSection';
import LoadingSpinner from '../components/LoadingSpinner';

const SuppliersPage = () => {
    const navigate = useNavigate();
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [supplierSearch, setSupplierSearch] = useState('');
    const [filterPendingPayments, setFilterPendingPayments] = useState(false);
    const [supplierStats, setSupplierStats] = useState(null);

    const fetchSuppliers = useCallback(async ({ search = '', hasPendingPayment = false } = {}) => {
        try {
            setLoading(true);
            const response = await api.get('/accounting/suppliers', {
                params: {
                    search,
                    hasPendingPayment
                }
            });
            setSuppliers(response.data.suppliers || []);
        } catch (error) {
            console.error('Failed to fetch suppliers:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSupplierStats = useCallback(async () => {
        try {
            const response = await api.get('/accounting/suppliers/stats/overview');
            setSupplierStats(response.data.stats);
        } catch (error) {
            console.error('Failed to fetch supplier stats:', error);
        }
    }, []);

    useEffect(() => {
        fetchSuppliers({
            search: supplierSearch,
            hasPendingPayment: filterPendingPayments
        });
        fetchSupplierStats();
    }, [fetchSuppliers, fetchSupplierStats, supplierSearch, filterPendingPayments]);

    const handleSupplierSearch = (searchTerm) => {
        setSupplierSearch(searchTerm);
        fetchSuppliers({
            search: searchTerm,
            hasPendingPayment: filterPendingPayments
        });
    };

    const handleFilterChange = (hasPending) => {
        setFilterPendingPayments(hasPending);
        fetchSuppliers({
            search: supplierSearch,
            hasPendingPayment: hasPending
        });
    };

    const handleSupplierClick = (supplier) => {
        navigate(`/business/suppliers/${supplier.id}`);
    };

    const handleAddSupplier = () => {
        // This will be handled by the modal in SuppliersSection
    };

    if (loading && !suppliers.length) {
        return <LoadingSpinner className="min-h-screen" />;
    }

    return (
        <ModernLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-brand-600">Suppliers</h1>
                    <p className="text-gray-500 mt-1">Manage your suppliers and track payables.</p>
                </div>

                <SuppliersSection
                    suppliers={suppliers}
                    supplierStats={supplierStats}
                    supplierLoading={loading}
                    supplierSearch={supplierSearch}
                    onSearchChange={handleSupplierSearch}
                    onAddSupplier={handleAddSupplier}
                    onRefreshSuppliers={() => fetchSuppliers({
                        search: supplierSearch,
                        hasPendingPayment: filterPendingPayments
                    })}
                    onSupplierClick={handleSupplierClick}
                    filterPendingPayments={filterPendingPayments}
                    onFilterChange={handleFilterChange}
                />
            </div>
        </ModernLayout>
    );
};

export default SuppliersPage;
