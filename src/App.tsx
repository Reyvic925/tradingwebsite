import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AuthConfirm from './pages/AuthConfirm';
import Dashboard from './pages/Dashboard';
import Trade from './pages/Trade';
import Markets from './pages/Markets';
import Invest from './pages/Invest';
import InvestmentDetail from './pages/InvestmentDetail';
import Wallet from './pages/Wallet';
import Social from './pages/Social';
import TraderProfile from './pages/TraderProfile';
import Referrals from './pages/Referrals';
import History from './pages/History';
import Profile from './pages/Profile';
import KycSubmit from './pages/KycSubmit';
import Source from './pages/Source';
import TermsOfService from './pages/TermsOfService';
import FAQ from './pages/FAQ';
import AdminRoute from './guards/AdminRoute';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminHealth from './pages/admin/Health';
import AdminTraders from './pages/admin/AdminTraders';
import AdminUsers from './pages/AdminUsers';
import AdminCryptoKeys from './pages/AdminCryptoKeys';
import AdminKyc from './pages/AdminKyc';
import AdminDeposits from './pages/AdminDeposits';
import AdminWithdrawals from './pages/AdminWithdrawals';
import ROIApprovals from './pages/admin/ROIApprovals';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
