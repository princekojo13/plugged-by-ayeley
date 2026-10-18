import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Minus, Plus, MessageCircle } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cartContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStoreSettings, whatsappLink } from "@/lib/useStoreSettings";

export default function ProductCard({ product }) {
  const { addToCart } = useCart();
  const { whatsapp } = useStoreSettings();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const compareAtPrice = Number(product.compare_at_price);
  const currentPrice = Number(product.price);
  const onSale = Number.isFinite(compareAtPrice) && compareAtPrice > currentPrice;
  const inStock = product.stock > 0;
  const effectivePrice = currentPrice;
  const maxQty = product.stock || 1;
  const interestLink = whatsappLink(
    whatsapp,
    `Hi, I’m interested in ${product.name}. Please let me know when it is back in stock.`
  );

  const openModal = () => {
    setQty(1);
    setOpen(true);
  };

  const confirmAdd = () => {
    addToCart(product, qty);
    setOpen(false);
    setQty(1);
  };

  return (
    <>
      <article className="group flex h-full flex-col border border-border bg-white transition-all duration-300 hover:border-carbon hover:shadow-lg">
        <Link to={`/product/${product.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-square overflow-hidden bg-london">
          <Image
            src={product.images?.[0]}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            fittingType="fill"
          />
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {onSale && (
              <span className="bg-pink text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                Sale
              </span>
            )}
            {product.new_arrival && (
              <span className="bg-carbon text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                New
              </span>
            )}
            {product.best_seller && !onSale && (
              <span className="bg-white text-carbon border border-carbon text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                Best Seller
              </span>
            )}
            {inStock && product.stock <= 5 && (
              <span className="bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                Low Stock
              </span>
            )}
            {!inStock && (
              <span className="bg-carbon text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                Out of stock
              </span>
            )}
          </div>
        </div>

        <div className="p-2.5 sm:p-4 flex flex-col flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{product.category}</p>
          <h3 className="font-heading font-semibold text-xs sm:text-sm text-carbon leading-snug line-clamp-2 mb-2 group-hover:text-pink transition-colors">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-2 mt-auto mb-3">
            <span className="font-heading font-bold text-sm sm:text-lg text-carbon">₵{effectivePrice.toFixed(2)}</span>
            {onSale && (
              <span className="text-sm text-muted-foreground line-through">₵{compareAtPrice.toFixed(2)}</span>
            )}
          </div>
        </div>
        </Link>
        <div className="px-2.5 pb-2.5 sm:px-4 sm:pb-4">
          {inStock ? (
            <button
              type="button"
              onClick={openModal}
              className={cn("w-full min-h-10 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wide sm:tracking-wider transition-colors flex items-center justify-center gap-1 sm:gap-2", "bg-carbon text-white hover:bg-pink")}
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Add to Cart
            </button>
          ) : (
            <a href={interestLink} target="_blank" rel="noopener noreferrer" className="w-full min-h-10 py-2 bg-pink text-white hover:bg-carbon text-[10px] sm:text-xs font-bold uppercase tracking-wide sm:tracking-wider transition-colors flex items-center justify-center gap-1 sm:gap-2">
              <MessageCircle className="w-3.5 h-3.5" /> I’m Interested
            </a>
          )}
        </div>
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-carbon">
              Add to Cart
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-london overflow-hidden shrink-0">
                <Image src={product.images?.[0]} alt={product.name} className="w-full h-full object-cover" fittingType="fill" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-carbon line-clamp-2">{product.name}</p>
                <p className="text-sm font-bold text-pink">₵{effectivePrice.toFixed(2)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-carbon mb-2">Quantity</p>
              <div className="flex items-center border border-border w-fit">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center text-carbon hover:bg-london"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-sm font-semibold text-carbon">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  className="w-10 h-10 flex items-center justify-center text-carbon hover:bg-london"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {inStock && product.stock <= 5 && (
                <p className="text-xs text-orange-600 mt-2">Only {product.stock} left in stock</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={confirmAdd} className="bg-pink text-white hover:bg-carbon">
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
