
import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./footer";
import WhatsAppFloat from "./WhatsAppFloat";

const PAGE_TITLES = {
  "/": "Original UK-Sourced Products Delivered in Ghana",
  "/shop": "Shop",
  "/cart": "Your Cart",
  "/checkout": "Checkout",
  "/about": "About Us",
  "/contact": "Contact Us",
  "/special-offers": "Special Offers",
  "/wholesale": "Wholesale Enquiries",
  "/delivery": "Delivery Information",
  "/track-order": "Track Your Order",
  "/my-orders": "My Orders",
};

export default function Layout() {
  const { pathname } = useLocation();
  const hideWhatsApp =
    ["/cart", "/checkout", "/contact", "/track-order", "/my-orders", "/wholesale"].includes(pathname) ||
    pathname.startsWith("/product/");

  useEffect(() => {
    const pageTitle =
      PAGE_TITLES[pathname] ||
      (pathname.startsWith("/product/") ? "Product Details" : "Page Not Found");
    document.title = pathname === "/"
      ? `Plugged by Ayeley | ${pageTitle}`
      : `${pageTitle} | Plugged by Ayeley`;
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />

      {!hideWhatsApp && <WhatsAppFloat />}
    </div>
  );
}
