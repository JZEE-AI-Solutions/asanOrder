import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForms, useTenant } from '../hooks';
import toast from 'react-hot-toast';
import ModernLayout from '../components/ModernLayout';
import FormsSection from '../components/dashboard/FormsSection';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmationModal from '../components/ConfirmationModal';
import api from '../services/api';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    EyeSlashIcon,
    ShareIcon,
    ShoppingBagIcon
} from '@heroicons/react/24/outline';

const FormsPage = () => {
    const navigate = useNavigate();
    const { tenant } = useTenant();
    const { forms, loading: formsLoading, refreshForms } = useForms();
    const [allForms, setAllForms] = useState([]); // All forms including unpublished
    const [confirmationModal, setConfirmationModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'warning',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        onConfirm: null
    });

    useEffect(() => {
        if (tenant) {
            refreshForms();
            fetchAllForms(); // Fetch all forms for management
        }
    }, [tenant, refreshForms]);

    const fetchAllForms = async () => {
        try {
            const response = await api.get('/form?includeUnpublished=true');
            setAllForms(response.data.forms || []);
        } catch (error) {
            console.error('Failed to fetch all forms:', error);
            setAllForms([]);
        }
    };

    const handleFormOpen = (form) => {
        const url = `${window.location.origin}/form/${form.formLink}`;
        window.open(url, '_blank');
    };

    const handleFormShare = (form) => {
        const url = `${window.location.origin}/form/${form.formLink}`;
        const message = `Hi! You can place your order for ${tenant.businessName} using this link: ${url}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    const handleFormCopyLink = (form) => {
        const url = `${window.location.origin}/form/${form.formLink}`;
        navigator.clipboard.writeText(url);
        toast.success('Form link copied to clipboard!');
    };

    const handleManageProducts = (form) => {
        navigate(`/business/forms/${form.id}/products`);
    };

    const handleCreateForm = () => {
        navigate('/business/forms/new');
    };

    const handleEditForm = (form) => {
        navigate(`/business/forms/${form.id}/edit`);
    };

    const publishForm = async (formId) => {
        try {
            const response = await api.post(`/form/${formId}/publish`);
            toast.success('Form published successfully!');
            toast.success(`Form URL: ${response.data.formUrl}`);
            refreshForms();
            fetchAllForms();
        } catch (error) {
            const errorMsg = typeof error.response?.data?.error === 'string'
              ? error.response?.data?.error
              : error.response?.data?.error?.message || 'Failed to publish form'
            toast.error(errorMsg);
        }
    };

    const unpublishForm = async (formId, formName) => {
        try {
            await api.post(`/form/${formId}/unpublish`);
            toast.success(`Form "${formName}" unpublished successfully!`);
            refreshForms();
            fetchAllForms();
        } catch (error) {
            const errorMsg = typeof error.response?.data?.error === 'string'
              ? error.response?.data?.error
              : error.response?.data?.error?.message || 'Failed to unpublish form'
            toast.error(errorMsg);
        }
    };

    const deleteForm = async (formId, formName) => {
        const confirmed = await showConfirmation(
            'Delete Form',
            `Are you sure you want to delete "${formName}"? This action cannot be undone.`,
            'danger',
            'Delete',
            'Cancel'
        );
        
        if (!confirmed) return;

        try {
            await api.delete(`/form/${formId}`);
            toast.success('Form deleted successfully!');
            refreshForms();
            fetchAllForms();
        } catch (error) {
            if (error.response?.data?.ordersCount > 0) {
                toast.error(`Cannot delete form with ${error.response.data.ordersCount} orders. Unpublish it instead.`);
            } else {
                const errorMsg = typeof error.response?.data?.error === 'string'
                  ? error.response?.data?.error
                  : error.response?.data?.error?.message || 'Failed to delete form'
                toast.error(errorMsg);
            }
        }
    };

    const showConfirmation = (title, message, type = 'warning', confirmText = 'Confirm', cancelText = 'Cancel') => {
        return new Promise((resolve) => {
            setConfirmationModal({
                isOpen: true,
                title,
                message,
                type,
                confirmText,
                cancelText,
                onConfirm: () => {
                    closeConfirmation();
                    resolve(true);
                }
            });
        });
    };

    const closeConfirmation = () => {
        setConfirmationModal({
            isOpen: false,
            title: '',
            message: '',
            type: 'warning',
            confirmText: 'Confirm',
            cancelText: 'Cancel',
            onConfirm: null
        });
    };

    if (formsLoading && !forms.length && !allForms.length) {
        return <LoadingSpinner className="min-h-screen" />;
    }

    return (
        <ModernLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-brand-600">Order Forms</h1>
                        <p className="text-gray-500 mt-1">Manage and share your order forms with customers.</p>
                    </div>
                    <button
                        onClick={handleCreateForm}
                        className="btn-primary flex items-center mt-4 sm:mt-0"
                    >
                        <PlusIcon className="h-5 w-5 mr-2" />
                        Create Form
                    </button>
                </div>

                {/* All Forms Management Table */}
                {allForms.length > 0 && (
                    <div className="card p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">All Forms</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Form Name
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Orders
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Fields
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {allForms.map((form) => (
                                        <tr key={form.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {form.name}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'}`}>
                                                    {form.isPublished ? 'Published' : 'Draft'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {form._count?.orders || 0}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {form.fields?.length || 0}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex justify-end space-x-2">
                                                    {form.isPublished ? (
                                                        <button
                                                            onClick={() => unpublishForm(form.id, form.name)}
                                                            className="text-yellow-600 hover:text-yellow-900 flex items-center"
                                                        >
                                                            <EyeSlashIcon className="h-4 w-4 mr-1" />
                                                            Unpublish
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => publishForm(form.id)}
                                                            className="text-green-600 hover:text-green-900 flex items-center"
                                                        >
                                                            <ShareIcon className="h-4 w-4 mr-1" />
                                                            Publish
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleEditForm(form)}
                                                        className="text-primary-600 hover:text-primary-900 flex items-center"
                                                    >
                                                        <PencilIcon className="h-4 w-4 mr-1" />
                                                        Edit
                                                    </button>
                                                    {(form.formCategory === 'SHOPPING_CART' || 
                                                      (form.fields && form.fields.some(field => field.fieldType === 'PRODUCT_SELECTOR'))) && (
                                                        <button
                                                            onClick={() => handleManageProducts(form)}
                                                            className="text-blue-600 hover:text-blue-900 flex items-center"
                                                            title="Manage Products"
                                                        >
                                                            <ShoppingBagIcon className="h-4 w-4 mr-1" />
                                                            Products
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => deleteForm(form.id, form.name)}
                                                        className="text-red-600 hover:text-red-900 flex items-center"
                                                    >
                                                        <TrashIcon className="h-4 w-4 mr-1" />
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Published Forms Section */}
                <FormsSection
                    forms={forms}
                    tenant={tenant}
                    onOpenForm={handleFormOpen}
                    onShareForm={handleFormShare}
                    onCopyFormLink={handleFormCopyLink}
                    onManageProducts={handleManageProducts}
                />
            </div>

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={confirmationModal.isOpen}
                onClose={closeConfirmation}
                onConfirm={confirmationModal.onConfirm}
                title={confirmationModal.title}
                message={confirmationModal.message}
                type={confirmationModal.type}
                confirmText={confirmationModal.confirmText}
                cancelText={confirmationModal.cancelText}
            />
        </ModernLayout>
    );
};

export default FormsPage;
