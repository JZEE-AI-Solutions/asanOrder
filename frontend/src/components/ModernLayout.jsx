import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from './Sidebar';
import CreateFormModal from './CreateFormModal';
import { Bars3Icon } from '@heroicons/react/24/outline';

const ModernLayout = ({ children }) => {
    const { logout } = useAuth();
    const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-brand-50 flex">
            <Sidebar
                onLogout={logout}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            <main className="flex-1 lg:ml-64 min-h-screen flex flex-col">
                {/* Mobile Header */}
                <div className="lg:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            <Bars3Icon className="w-6 h-6" />
                        </button>
                        <span className="font-bold text-gray-900">Dress Shop</span>
                    </div>
                    <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        DS
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </div>
            </main>

            {/* Global Modals */}
            {isNewOrderModalOpen && (
                <CreateFormModal
                    isOpen={isNewOrderModalOpen}
                    onClose={() => setIsNewOrderModalOpen(false)}
                />
            )}
        </div>
    );
};

export default ModernLayout;
