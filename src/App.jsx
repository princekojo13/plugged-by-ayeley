import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";

import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import ScrollToTop from "./components/ScrollToTop";
import Layout from "@/components/Layout";
import { CartProvider } from "@/lib/cartContext";

// Public store pages
import Home from "@/pages/Home";
import Shop from "@/pages/Shop";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import SpecialOffers from "@/pages/SpecialOffers";
import Wholesale from "@/pages/Wholesale";
import Delivery from "@/pages/Delivery";
import TrackOrder from "@/pages/TrackOrder";
import MyOrders from "@/pages/MyOrders";

// Admin
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminProducts from "@/pages/AdminProducts";
import AdminProductForm from "@/pages/AdminProductForm";
import AdminOrders from "@/pages/AdminOrders";
import AdminReviews from "@/pages/AdminReviews";
import AdminSettings from "@/pages/AdminSettings";
import AdminAssistants from "@/pages/AdminAssistants";
import AssistantWorkspace from "@/pages/AssistantWorkspace";
import AssistantInviteAccept from "@/pages/AssistantInviteAccept";
import useAdminOrderNotifications from "@/lib/useAdminOrderNotifications";

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#fafafa]">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-black/10 border-t-[#ff1f8f]"
        aria-label="Loading"
      />
    </div>
  );
}

/*
 * FRONTEND ADMIN GUARD
 *
 * This protects the admin UI from unauthenticated users.
 *
 * IMPORTANT:
 * This is NOT the real security boundary.
 * Supabase Auth + RLS + secure Edge Functions are the
 * actual protection for the data.
 */
function AdminProtectedRoute({ children }) {
  const {
    loading,
    isAuthenticated,
    isAdmin,
  } = useAuth();

  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <Navigate
        to="/admin-login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  return (
    <>
      <AdminOrderNotificationListener />
      {children}
    </>
  );
}

function AdminOrderNotificationListener() {
  useAdminOrderNotifications();
  return null;
}

function AssistantOrderNotificationListener() {
  useAdminOrderNotifications({
    includeCatalogAlerts: false,
    channelName: "assistant-order-notifications",
  });
  return null;
}

function AssistantProtectedRoute({ children }) {
  const { loading, isAuthenticated, isAssistant } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!isAuthenticated || !isAssistant) {
    return <Navigate to="/admin-login" replace state={{ from: location.pathname }} />;
  }
  return (
    <>
      <AssistantOrderNotificationListener />
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* =====================================================
          ADMIN LOGIN
      ===================================================== */}

      <Route
        path="/admin-login"
        element={<Login />}
      />
      <Route path="/assistant-login" element={<Login />} />
      <Route path="/assistant-invite" element={<AssistantInviteAccept />} />

      <Route
        path="/assistant"
        element={
          <AssistantProtectedRoute>
            <AssistantWorkspace />
          </AssistantProtectedRoute>
        }
      />

      {/* =====================================================
          PROTECTED ADMIN
      ===================================================== */}

      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminDashboard />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/products"
        element={
          <AdminProtectedRoute>
            <AdminProducts />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/products/new"
        element={
          <AdminProtectedRoute>
            <AdminProductForm />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/products/:id/edit"
        element={
          <AdminProtectedRoute>
            <AdminProductForm />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/orders"
        element={
          <AdminProtectedRoute>
            <AdminOrders />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/pre-orders"
        element={
          <AdminProtectedRoute>
            <AdminOrders preordersOnly />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/reviews"
        element={
          <AdminProtectedRoute>
            <AdminReviews />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/settings"
        element={
          <AdminProtectedRoute>
            <AdminSettings />
          </AdminProtectedRoute>
        }
      />

      <Route
        path="/admin/assistants"
        element={
          <AdminProtectedRoute>
            <AdminAssistants />
          </AdminProtectedRoute>
        }
      />

      {/* =====================================================
          PUBLIC STORE
      ===================================================== */}

      <Route element={<Layout />}>
        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/shop"
          element={<Shop />}
        />

        <Route
          path="/product/:id"
          element={<ProductDetail />}
        />

        <Route
          path="/cart"
          element={<Cart />}
        />

        <Route
          path="/checkout"
          element={<Checkout />}
        />

        <Route
          path="/about"
          element={<About />}
        />

        <Route
          path="/contact"
          element={<Contact />}
        />

        <Route
          path="/special-offers"
          element={<SpecialOffers />}
        />

        <Route
          path="/wholesale"
          element={<Wholesale />}
        />

        <Route
          path="/delivery"
          element={<Delivery />}
        />

        <Route
        />

        <Route
          path="/track-order"
          element={<TrackOrder />}
        />

        <Route
          path="/my-orders"
          element={<MyOrders />}
        />

        {/* Customer authentication has been removed.
            These legacy URLs return customers to the store. */}

        <Route
          path="/login"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />

        <Route
          path="/register"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />

        <Route
          path="/forgot-password"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />

        <Route
          path="/reset-password"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Route>

      {/* =====================================================
          404
      ===================================================== */}

      <Route
        path="*"
        element={<PageNotFound />}
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <CartProvider>
          <Router>
            <ScrollToTop />
            <AppRoutes />
          </Router>

          <Toaster />
        </CartProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
