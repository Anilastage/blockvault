import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { VaultProvider } from '@/context/VaultContext';
import { WalletProvider } from '@/context/WalletContext';
import { ToastProvider } from '@/context/ToastContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ProtectedRoute, AdminRoute } from '@/routes/guards';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';

import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { RecoverVaultPage } from '@/pages/RecoverVaultPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { DocumentDetailPage } from '@/pages/DocumentDetailPage';
import { UploadPage } from '@/pages/UploadPage';
import { VerifyPage } from '@/pages/VerifyPage';
import { DownloadByCodePage } from '@/pages/DownloadByCodePage';
import { ShareDocumentPage } from '@/pages/ShareDocumentPage';
import { ExplorerPage } from '@/pages/ExplorerPage';
import { VerificationHistoryPage } from '@/pages/VerificationHistoryPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { AccessRequestsPage } from '@/pages/AccessRequestsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { AdminUserDetailPage } from '@/pages/admin/AdminUserDetailPage';
import { AdminDocumentsPage } from '@/pages/admin/AdminDocumentsPage';
import { AdminTransactionsPage } from '@/pages/admin/AdminTransactionsPage';
import { AdminActivityPage } from '@/pages/admin/AdminActivityPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <VaultProvider>
              <WalletProvider>
                <ToastProvider>
                  <NotificationProvider>
                    <Routes>
                      {/* Public */}
                      <Route element={<PublicLayout />}>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/verify" element={<VerifyPage />} />
                        <Route path="/verify/:hash" element={<VerifyPage />} />
                      </Route>
    
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                      <Route path="/recover" element={<RecoverVaultPage />} />
    
                      {/* Authenticated */}
                      <Route element={<ProtectedRoute />}>
                        <Route path="/dashboard" element={<DashboardLayout title="Dashboard" />}>
                          <Route index element={<DashboardPage />} />
                        </Route>
                        <Route path="/documents" element={<DashboardLayout title="Documents" />}>
                          <Route index element={<DocumentsPage />} />
                        </Route>
                        <Route path="/documents/:id" element={<DashboardLayout title="Document Details" />}>
                          <Route index element={<DocumentDetailPage />} />
                        </Route>
                        <Route path="/upload" element={<DashboardLayout title="Upload Document" />}>
                          <Route index element={<UploadPage />} />
                        </Route>
                        <Route
                          path="/verification-history"
                          element={<DashboardLayout title="Verification History" />}
                        >
                          <Route index element={<VerificationHistoryPage />} />
                        </Route>
                        <Route path="/analytics" element={<DashboardLayout title="Analytics" />}>
                          <Route index element={<AnalyticsPage />} />
                        </Route>
                        <Route path="/activity" element={<DashboardLayout title="Activity Logs" />}>
                          <Route index element={<ActivityPage />} />
                        </Route>
                        <Route path="/access-requests" element={<DashboardLayout title="Access Requests" />}>
                          <Route index element={<AccessRequestsPage />} />
                        </Route>
                        <Route path="/notifications" element={<DashboardLayout title="Notifications" />}>
                          <Route index element={<NotificationsPage />} />
                        </Route>
                        <Route path="/blockchain" element={<DashboardLayout title="Blockchain Explorer" />}>
                          <Route index element={<ExplorerPage />} />
                        </Route>
                        <Route path="/profile" element={<DashboardLayout title="Profile" />}>
                          <Route index element={<ProfilePage />} />
                        </Route>
                        <Route path="/settings" element={<DashboardLayout title="Settings" />}>
                          <Route index element={<SettingsPage />} />
                        </Route>
                        <Route path="/download" element={<DashboardLayout title="Download Document" />}>
                          <Route index element={<DownloadByCodePage />} />
                        </Route>
                        <Route path="/share" element={<DashboardLayout title="Share Document" />}>
                          <Route index element={<ShareDocumentPage />} />
                        </Route>
                      </Route>
    
                      {/* Admin */}
                      <Route element={<AdminRoute />}>
                        <Route path="/admin" element={<DashboardLayout title="Admin Dashboard" />}>
                          <Route index element={<AdminDashboardPage />} />
                        </Route>
                        <Route path="/admin/users" element={<DashboardLayout title="User Management" />}>
                          <Route index element={<AdminUsersPage />} />
                        </Route>
                        <Route
                          path="/admin/users/:id"
                          element={<DashboardLayout title="User Documents" />}
                        >
                          <Route index element={<AdminUserDetailPage />} />
                        </Route>
                        <Route path="/admin/documents" element={<DashboardLayout title="All Documents" />}>
                          <Route index element={<AdminDocumentsPage />} />
                        </Route>
                        <Route
                          path="/admin/transactions"
                          element={<DashboardLayout title="Blockchain Transactions" />}
                        >
                          <Route index element={<AdminTransactionsPage />} />
                        </Route>
                        <Route path="/admin/activity" element={<DashboardLayout title="Activity Logs" />}>
                          <Route index element={<AdminActivityPage />} />
                        </Route>
                      </Route>
    
                      <Route path="/404" element={<NotFoundPage />} />
                      <Route path="/explorer" element={<Navigate to="/blockchain" replace />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </NotificationProvider>
                </ToastProvider>
              </WalletProvider>
            </VaultProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
