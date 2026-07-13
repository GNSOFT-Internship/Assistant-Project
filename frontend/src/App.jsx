import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Layout from './components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Assets = lazy(() => import('./pages/Assets'));
const AssetDetail = lazy(() => import('./pages/AssetDetail'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Recommendations = lazy(() => import('./pages/Recommendations'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const FileUpload = lazy(() => import('./pages/FileUpload'));
const Reports = lazy(() => import('./pages/Reports'));
const Budget = lazy(() => import('./pages/Budget'));
const AuditLog = lazy(() => import('./pages/AuditLog'));

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
}

function LoginRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (isAuthenticated()) return <Navigate to="/dashboard" replace />;
  return <Login />;
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route
                  path="/"
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route
                    path="dashboard"
                    element={
                      <Suspense fallback={null}>
                        <Dashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="assets"
                    element={
                      <Suspense fallback={null}>
                        <Assets />
                      </Suspense>
                    }
                  />
                  <Route
                    path="assets/:id"
                    element={
                      <Suspense fallback={null}>
                        <AssetDetail />
                      </Suspense>
                    }
                  />
                  <Route
                    path="maintenance"
                    element={
                      <Suspense fallback={null}>
                        <Maintenance />
                      </Suspense>
                    }
                  />
                  <Route
                    path="recommendations"
                    element={
                      <Suspense fallback={null}>
                        <Recommendations />
                      </Suspense>
                    }
                  />
                  <Route
                    path="qa"
                    element={
                      <Suspense fallback={null}>
                        <AiAssistant />
                      </Suspense>
                    }
                  />
                  <Route
                    path="files"
                    element={
                      <Suspense fallback={null}>
                        <FileUpload />
                      </Suspense>
                    }
                  />
                  <Route
                    path="reports"
                    element={
                      <Suspense fallback={null}>
                        <Reports />
                      </Suspense>
                    }
                  />
                  <Route
                    path="budget"
                    element={
                      <Suspense fallback={null}>
                        <Budget />
                      </Suspense>
                    }
                  />
                  <Route
                    path="audit-log"
                    element={
                      <Suspense fallback={null}>
                        <AuditLog />
                      </Suspense>
                    }
                  />
                </Route>
              </Routes>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
