import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './guards/AdminRoute';
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const AuthConfirm = lazy(() => import('./pages/AuthConfirm'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Trade = lazy(() => import('./pages/Trade'));
const Markets = lazy(() => import('./pages/Markets'));
const Invest = lazy(() => import('./pages/Invest'));
const InvestmentDetail = lazy(() => import('./pages/InvestmentDetail'));
const Wallet = lazy(() => import('./pages/Wallet'));
const Social = lazy(() => import('./pages/Social'));
const TraderProfile = lazy(() => import('./pages/TraderProfile'));
const Referrals = lazy(() => import('./pages/Referrals'));
const History = lazy(() => import('./pages/History'));
const Profile = lazy(() => import('./pages/Profile'));
const KycSubmit = lazy(() => import('./pages/KycSubmit'));
const Source = lazy(() => import('./pages/Source'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const FAQ = lazy(() => import('./pages/FAQ'));
const AdminLogin = lazy(() => import('./pages/admin/Login'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminHealth = lazy(() => import('./pages/admin/Health'));
const AdminTraders = lazy(() => import('./pages/admin/AdminTraders'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminCryptoKeys = lazy(() => import('./pages/AdminCryptoKeys'));
const AdminKyc = lazy(() => import('./pages/AdminKyc'));
const AdminDeposits = lazy(() => import('./pages/AdminDeposits'));
const AdminWithdrawals = lazy(() => import('./pages/AdminWithdrawals'));
const ROIApprovals = lazy(() => import('./pages/admin/ROIApprovals'));

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application route failed to render', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#05070b] px-5 text-stone-100">
          <section role="alert" className="max-w-lg rounded-md border border-white/10 bg-white/[0.03] p-8 text-center">
            <h1 className="font-display text-3xl">We couldn’t load this page.</h1>
            <p className="mt-3 text-sm text-stone-400">
              The page failed to start. Reload to try again; if the problem continues, contact support.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#1a1304]"
            >
              Reload page
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-[#05070b]">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              </div>
            }
          >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/confirm" element={<AuthConfirm />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
            <Route path="/source" element={<Source />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/faq" element={<FAQ />} />
            <Route
              path="/admin/dashboard"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/health"
              element={
                <AdminRoute>
                  <AdminHealth />
                </AdminRoute>
              }
            />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/trade"
              element={
                <ProtectedRoute>
                  <Trade />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/trade/:symbol"
              element={
                <ProtectedRoute>
                  <Trade />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/markets"
              element={
                <ProtectedRoute>
                  <Markets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/invest"
              element={
                <ProtectedRoute>
                  <Invest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/invest/:id"
              element={
                <ProtectedRoute>
                  <InvestmentDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/wallet"
              element={
                <ProtectedRoute>
                  <Wallet />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/social"
              element={
                <ProtectedRoute>
                  <Social />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/trader/:traderId"
              element={
                <ProtectedRoute>
                  <TraderProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/referrals"
              element={
                <ProtectedRoute>
                  <Referrals />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/history"
              element={
                <ProtectedRoute>
                  <History />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/kyc"
              element={
                <ProtectedRoute>
                  <KycSubmit />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/admin/traders"
              element={
                <AdminRoute>
                  <AdminTraders />
                </AdminRoute>
              }
            />
            <Route
              path="/app/admin/users"
              element={
                <AdminRoute>
                  <AdminUsers />
                </AdminRoute>
              }
            />
            <Route
              path="/app/admin/crypto-keys"
              element={
                <AdminRoute>
                  <AdminCryptoKeys />
                </AdminRoute>
              }
            />
            <Route
              path="/app/admin/kyc"
              element={
                <AdminRoute>
                  <AdminKyc />
                </AdminRoute>
              }
            />
            <Route
              path="/app/admin/deposits"
              element={
                <AdminRoute>
                  <AdminDeposits />
                </AdminRoute>
              }
            />
            <Route
              path="/app/admin/withdrawals"
              element={
                <AdminRoute>
                  <AdminWithdrawals />
                </AdminRoute>
              }
            />
            <Route
              path="/app/admin/roi-approvals"
              element={
                <AdminRoute>
                  <ROIApprovals />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
