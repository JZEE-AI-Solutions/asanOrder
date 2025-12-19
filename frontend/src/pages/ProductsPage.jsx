import React from 'react';
import ModernLayout from '../components/ModernLayout';
import ProductsManagement from '../components/dashboard/ProductsManagement';

const ProductsPage = () => {
    return (
        <ModernLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-brand-600">Products</h1>
                    <p className="text-gray-500 mt-1">Manage your product inventory and details.</p>
                </div>
                <ProductsManagement />
            </div>
        </ModernLayout>
    );
};

export default ProductsPage;
