import React from 'react';
import ModernLayout from '../components/ModernLayout';
import PurchasesManagement from '../components/dashboard/PurchasesManagement';

const PurchasesPage = () => {
    return (
        <ModernLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-brand-600">Purchases</h1>
                    <p className="text-gray-500 mt-1">Manage purchase invoices and stock intake.</p>
                </div>
                <PurchasesManagement />
            </div>
        </ModernLayout>
    );
};

export default PurchasesPage;
