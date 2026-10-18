import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ArrowLeft } from "lucide-react";
import { Image } from "@/components/ui/image";
import { useCart } from "@/lib/cartContext";
import { supabase } from "@/lib/supabaseClient";
import { useProducts } from "@/lib/useProducts";

export default function Cart() {
  const { items, updateQuantity, refreshProductAvailability, removeFromCart, subtotal } = useCart();
  const { products: availableProducts, loading: productsLoading } = useProducts({ limit: 1 });
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState(
    () => (items.length ? "checking" : "ready")
  );
  const productIdsKey = useMemo(
    () => [...new Set(items.map((item) => item.product_id).filter(Boolean))].join(","),
    [items]
  );
  const catalogEmpty = !productsLoading && availableProducts.length === 0;

  useEffect(() => {
    const productIds = productIdsKey ? productIdsKey.split(",") : [];
    if (!productIds.length) {
      setAvailabilityStatus("ready");
      return undefined;
    }

    let isCurrent = true;
    setAvailabilityStatus("checking");

    const checkAvailability = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,stock_quantity")
        .in("id", productIds)
        .eq("active", true);

      if (!isCurrent) return;
      if (error) {
        setAvailabilityStatus("error");
        return;
      }

      const currentProducts = data || [];
      const activeIds = new Set(currentProducts.map((product) => product.id));
      const unavailableIds = productIds.filter((id) => !activeIds.has(id));
      const outOfStockIds = currentProducts
        .filter((product) => Number(product.stock_quantity) <= 0)
        .map((product) => product.id);
      const removeIds = [...new Set([...unavailableIds, ...outOfStockIds])];
      if (removeIds.length) {
        removeIds.forEach(removeFromCart);
        setAvailabilityNotice(
          removeIds.length === 1
            ? "An unavailable item was removed from your cart. You can ask about it from the product page."
            : "Unavailable items were removed from your cart. You can ask about them from their product pages."
        );
      }
      refreshProductAvailability(currentProducts);
      setAvailabilityStatus("ready");
    };

    checkAvailability();
    return () => {
      isCurrent = false;
    };
  }, [productIdsKey, refreshProductAvailability, removeFromCart]);

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        {availabilityNotice && (
          <p role="status" className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {availabilityNotice}
          </p>
        )}
        <div className="w-20 h-20 bg-london rounded-full flex items-center justify-center mx-auto mb-6">
          <ShoppingBag className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-3xl font-bold text-carbon mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8">
          {catalogEmpty
            ? "Our collection is being updated. Please check back soon, or contact us for help."
            : "Browse our UK-sourced products and find something you love."}
        </p>
        <Link
          to={catalogEmpty ? "/contact" : "/shop"}
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-carbon text-white font-bold uppercase tracking-wider text-sm hover:bg-pink transition-colors"
        >
          {catalogEmpty ? "Contact Us" : "Shop Now"} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="font-heading text-3xl sm:text-4xl font-bold text-carbon mb-8">Shopping Cart</h1>
      {availabilityNotice && (
        <p role="status" className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {availabilityNotice}
        </p>
      )}
      {availabilityStatus === "error" && (
        <p role="alert" className="mb-6 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We couldn’t confirm product availability. Refresh the page before checking out.
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div key={item.product_id} className="flex gap-4 border border-border p-4">
              <Link to={`/product/${item.product_id}`} className="w-24 h-24 sm:w-28 sm:h-28 bg-london overflow-hidden shrink-0">
                {item.image ? (
                  <Image src={item.image} alt={item.name} className="w-full h-full object-cover" fittingType="fill" />
                ) : (
                  <div className="w-full h-full" />
                )}
              </Link>
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between gap-2">
                  <Link to={`/product/${item.product_id}`} className="font-heading font-semibold text-sm sm:text-base text-carbon hover:text-pink transition-colors line-clamp-2">
                    {item.name}
                  </Link>
                  <button
                    onClick={() => removeFromCart(item.product_id)}
                    className="text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">₵{item.price.toFixed(2)} each</p>
                <div className="flex items-center justify-between mt-auto pt-3">
                  <div className="flex items-center border border-border">
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                      disabled={Number(item.stock) <= 0}
                      className="w-9 h-9 flex items-center justify-center hover:bg-london transition-colors"
                      aria-label="Decrease"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      disabled={Number(item.stock) <= 0 || item.quantity >= Number(item.stock)}
                      className="w-9 h-9 flex items-center justify-center hover:bg-london transition-colors"
                      aria-label="Increase"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="font-heading font-bold text-lg text-carbon">₵{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
          <Link to="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-carbon hover:text-pink transition-colors">
            <ArrowLeft className="w-4 h-4" /> Continue Shopping
          </Link>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-london/50 border border-border p-6 sticky top-28">
            <h2 className="font-heading text-xl font-bold text-carbon mb-4">Order Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold text-carbon">₵{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span className="text-right text-muted-foreground">Choose a delivery location at checkout</span>
              </div>
            </div>
            <div className="border-t border-border mt-4 pt-4 flex justify-between items-baseline">
              <span className="font-heading font-bold text-lg text-carbon">Items subtotal</span>
              <span className="font-heading font-bold text-2xl text-carbon">₵{subtotal.toFixed(2)}</span>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Delivery and your full total appear after you choose a delivery location.
            </p>
            {availabilityStatus === "ready" && items.every((item) => Number(item.stock) > 0 && item.quantity <= Number(item.stock)) ? (
              <Link
                to="/checkout"
                className="w-full mt-6 py-3.5 bg-pink text-white font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 hover:bg-carbon transition-colors"
              >
                Proceed to Checkout <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="w-full mt-6 py-3.5 bg-carbon/40 text-white font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 cursor-not-allowed"
              >
                {availabilityStatus === "checking" ? "Checking items…" : "Checkout unavailable"}
              </button>
            )}
            <p className="text-xs text-muted-foreground text-center mt-3">
              Pay with Mobile Money or Pay on Delivery
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
