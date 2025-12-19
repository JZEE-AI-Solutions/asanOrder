import React from 'react';
import ModernLayout from '../components/ModernLayout';
import ReturnsManagement from '../components/ReturnsManagement';

const ReturnsPage = () => {
    return (
        <ModernLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-brand-600">Returns</h1>
                    <p className="text-gray-500 mt-1">Manage customer returns and refunds.</p>
                </div>
                <ReturnsManagement />
            </div>
        </ModernLayout>
    );
};

export default ReturnsPage;
