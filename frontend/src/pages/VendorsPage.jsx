import React from 'react';
import ModernLayout from '../components/ModernLayout';
import { TruckIcon } from '@heroicons/react/24/outline';

const VendorsPage = () => {
    return (
        <ModernLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-brand-600">Vendors</h1>
                    <p className="text-gray-500 mt-1">Manage your suppliers and vendors.</p>
                </div>

                <div className="card p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <TruckIcon className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Vendor Management Coming Soon</h3>
                    <p className="text-gray-600 max-w-md mx-auto">
                        This module is currently under development. You will be able to manage your supplier details and relationships here.
                    </p>
                </div>
            </div>
        </ModernLayout>
    );
};

export default VendorsPage;
