import { useEffect } from "react";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";

function notifyAdmin(title, description, eventName, detail) {
  toast({ title, description });

  if (typeof window === "undefined") return;

  if ("Notification" in window && window.Notification.permission === "granted") {
    try {
      new window.Notification(title, { body: description });
    } catch {
      // Keep the in-app notification if desktop notifications are blocked.
    }
  }

  if (eventName) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

export default function useAdminOrderNotifications() {
  useEffect(() => {
    let active = true;
    let lowStockDefault = 5;
    const stockByProductId = new Map();

    const channel = supabase
      .channel("admin-live-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        ({ new: order }) => {
          if (!order?.id) return;

          const orderNumber = order.order_number ? `#${order.order_number}` : "";
          notifyAdmin(
            "New order received",
            orderNumber ? `Order ${orderNumber} is ready for review.` : "A customer has placed an order.",
            "admin:order-inserted",
            order,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "products" },
        ({ new: product }) => {
          if (!product?.id) return;

          const currentStock = Math.max(0, Number(product.stock_quantity) || 0);
          const threshold = Math.max(0, Number(product.low_stock_threshold ?? lowStockDefault) || 0);
          stockByProductId.set(product.id, currentStock);
          if (currentStock <= threshold) {
            notifyAdmin(
              "Product stock is low",
              `${product.name || "A product"} has ${currentStock} left (alert threshold: ${threshold}).`,
              "admin:product-updated",
              product,
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products" },
        ({ new: product, old }) => {
          if (!product?.id) return;

          const previousStock = Number(old?.stock_quantity ?? stockByProductId.get(product.id));
          const currentStock = Math.max(0, Number(product.stock_quantity) || 0);
          const threshold = Math.max(0, Number(product.low_stock_threshold ?? lowStockDefault) || 0);
          stockByProductId.set(product.id, currentStock);

          if (Number.isFinite(previousStock) && previousStock > threshold && currentStock <= threshold) {
            notifyAdmin(
              "Product stock is low",
              `${product.name || "A product"} has ${currentStock} left (alert threshold: ${threshold}).`,
              "admin:product-updated",
              product,
            );
          } else {
            window.dispatchEvent(new CustomEvent("admin:product-updated", { detail: product }));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reviews" },
        ({ new: review }) => {
          if (!review?.id || review.approved) return;

          notifyAdmin(
            "New review needs approval",
            `${review.customer_name || "A customer"} submitted a ${review.rating || "new"}-star review.`,
            "admin:review-inserted",
            review,
          );
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Live admin notifications are temporarily unavailable.");
        }
      });

    // Establish the stock baseline after opening the realtime channel so that
    // existing low-stock products do not create a flood of alerts on login.
    void Promise.all([
      supabase.from("products").select("id,stock_quantity"),
      supabase.from("store_settings").select("low_stock_default").eq("id", true).maybeSingle(),
    ]).then(([productsResult, settingsResult]) => {
      if (!active) return;
      if (!productsResult.error) {
        for (const product of productsResult.data || []) {
          stockByProductId.set(product.id, Math.max(0, Number(product.stock_quantity) || 0));
        }
      }
      if (!settingsResult.error && settingsResult.data?.low_stock_default != null) {
        lowStockDefault = Math.max(0, Number(settingsResult.data.low_stock_default) || 0);
      }
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);
}
