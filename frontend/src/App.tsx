import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import StoreLayout from "./components/StoreLayout";
const Home = lazy(() => import("./pages/store/Home"));
const ProductPage = lazy(() => import("./pages/store/ProductPage"));
const PayPage = lazy(() => import("./pages/store/PayPage"));
const OrderQueryPage = lazy(() => import("./pages/store/OrderQueryPage"));
const PostsPage = lazy(() => import("./pages/store/PostsPage"));
const PostDetail = lazy(() => import("./pages/store/PostDetail"));
const MemberAuth = lazy(() => import("./pages/store/MemberAuth"));
const MemberCenter = lazy(() => import("./pages/store/MemberCenter"));
const TermsPage = lazy(() => import("./pages/store/TermsPage"));
const AboutPage = lazy(() => import("./pages/store/AboutPage"));
const RedeemPage = lazy(() => import("./pages/store/RedeemPage"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const ProductsAdmin = lazy(() => import("./pages/admin/ProductsAdmin"));
const CardsAdmin = lazy(() => import("./pages/admin/CardsAdmin"));
const OrdersAdmin = lazy(() => import("./pages/admin/OrdersAdmin"));
const ChannelsAdmin = lazy(() => import("./pages/admin/ChannelsAdmin"));
const UsersAdmin = lazy(() => import("./pages/admin/UsersAdmin"));
const AuditAdmin = lazy(() => import("./pages/admin/AuditAdmin"));
const SecurityAdmin = lazy(() => import("./pages/admin/SecurityAdmin"));
const CouponsAdmin = lazy(() => import("./pages/admin/CouponsAdmin"));
const SettingsAdmin = lazy(() => import("./pages/admin/SettingsAdmin"));
const ArticlesAdmin = lazy(() => import("./pages/admin/ArticlesAdmin"));
const MembersAdmin = lazy(() => import("./pages/admin/MembersAdmin"));
const WithdrawalsAdmin = lazy(() => import("./pages/admin/WithdrawalsAdmin"));
const MemberLevelsAdmin = lazy(() => import("./pages/admin/MemberLevelsAdmin"));
const GiftCardsAdmin = lazy(() => import("./pages/admin/GiftCardsAdmin"));
const RiskReviewsAdmin = lazy(() => import("./pages/admin/RiskReviewsAdmin"));
const SupportTicketsAdmin = lazy(() => import("./pages/admin/SupportTicketsAdmin"));

export default function App() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-5 py-16" role="status"><div className="h-5 w-32 animate-pulse rounded bg-ink/10" /><div className="mt-5 h-48 animate-pulse rounded-2xl bg-ink/[0.04]" /><span className="sr-only">Loading…</span></div>}>
    <Routes>
      <Route element={<StoreLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/pay/:orderNo" element={<PayPage />} />
        <Route path="/order" element={<OrderQueryPage />} />
        <Route path="/redeem" element={<RedeemPage />} />
        <Route path="/posts" element={<PostsPage />} />
        <Route path="/posts/:slug" element={<PostDetail />} />
        <Route path="/login" element={<MemberAuth />} />
        <Route path="/register" element={<MemberAuth />} />
        <Route path="/me" element={<MemberCenter />} />
        <Route path="/tos" element={<TermsPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Route>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<ProductsAdmin />} />
        <Route path="cards" element={<CardsAdmin />} />
        <Route path="orders" element={<OrdersAdmin />} />
        <Route path="channels" element={<ChannelsAdmin />} />
        <Route path="users" element={<UsersAdmin />} />
        <Route path="audit" element={<AuditAdmin />} />
        <Route path="coupons" element={<CouponsAdmin />} />
        <Route path="articles" element={<ArticlesAdmin />} />
        <Route path="members" element={<MembersAdmin />} />
        <Route path="member-levels" element={<MemberLevelsAdmin />} />
        <Route path="gift-cards" element={<GiftCardsAdmin />} />
        <Route path="risk-reviews" element={<RiskReviewsAdmin />} />
        <Route path="support-tickets" element={<SupportTicketsAdmin />} />
        <Route path="withdrawals" element={<WithdrawalsAdmin />} />
        <Route path="settings" element={<SettingsAdmin />} />
        <Route path="security" element={<SecurityAdmin />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
