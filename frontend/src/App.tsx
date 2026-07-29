import { Route, Routes } from "react-router-dom";
import StoreLayout from "./components/StoreLayout";
import Home from "./pages/store/Home";
import ProductPage from "./pages/store/ProductPage";
import PayPage from "./pages/store/PayPage";
import OrderQueryPage from "./pages/store/OrderQueryPage";
import PostsPage from "./pages/store/PostsPage";
import PostDetail from "./pages/store/PostDetail";
import MemberAuth from "./pages/store/MemberAuth";
import MemberCenter from "./pages/store/MemberCenter";
import TermsPage from "./pages/store/TermsPage";
import AboutPage from "./pages/store/AboutPage";
import RedeemPage from "./pages/store/RedeemPage";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import ProductsAdmin from "./pages/admin/ProductsAdmin";
import CardsAdmin from "./pages/admin/CardsAdmin";
import OrdersAdmin from "./pages/admin/OrdersAdmin";
import ChannelsAdmin from "./pages/admin/ChannelsAdmin";
import UsersAdmin from "./pages/admin/UsersAdmin";
import AuditAdmin from "./pages/admin/AuditAdmin";
import SecurityAdmin from "./pages/admin/SecurityAdmin";
import CouponsAdmin from "./pages/admin/CouponsAdmin";
import SettingsAdmin from "./pages/admin/SettingsAdmin";
import ArticlesAdmin from "./pages/admin/ArticlesAdmin";
import MembersAdmin from "./pages/admin/MembersAdmin";
import WithdrawalsAdmin from "./pages/admin/WithdrawalsAdmin";
import MemberLevelsAdmin from "./pages/admin/MemberLevelsAdmin";
import GiftCardsAdmin from "./pages/admin/GiftCardsAdmin";
import RiskReviewsAdmin from "./pages/admin/RiskReviewsAdmin";
import SupportTicketsAdmin from "./pages/admin/SupportTicketsAdmin";

export default function App() {
  return (
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
  );
}
