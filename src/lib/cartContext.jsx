import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "plugged_cart_v1";

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addToCart = useCallback((product, quantity = 1) => {
    const stock = typeof product.stock === "number" ? product.stock : Infinity;
    if (stock <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, max);
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: newQty } : i
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          price: product.sale_price || product.price,
          quantity: Math.min(quantity, max),
          image: product.images?.[0] || "",
          stock: product.stock,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity < 1) return;
    setItems((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const max = typeof i.stock === "number" ? i.stock : Infinity;
      if (max <= 0) return i;
      return { ...i, quantity: Math.min(quantity, max) };
    }));
  }, []);

  const refreshProductAvailability = useCallback((products) => {
    const byId = new Map(products.map((product) => [product.id, product]));
    setItems((prev) => prev.map((item) => {
      const product = byId.get(item.product_id);
      if (!product) return item;
      const stock = Math.max(0, Number(product.stock_quantity ?? 0));
      return {
        ...item,
        stock,
        quantity: stock > 0 ? Math.max(1, Math.min(item.quantity, stock)) : item.quantity,
      };
    }));
  }, []);

  const removeFromCart = useCallback((productId) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addToCart, updateQuantity, refreshProductAvailability, removeFromCart, clearCart, subtotal, totalItems }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
