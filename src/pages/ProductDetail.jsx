import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBag, MessageCircle, ArrowLeft, ShieldCheck, Truck, Check, ChevronRight } from "lucide-react";
import { Image } from "@/components/ui/image";
import { useProduct, useProducts } from "@/lib/useProducts";
import { useCart } from "@/lib/cartContext";
import ProductCard from "@/components/ProductCard";
import ReviewSection from "@/components/ReviewSection";
import { cn } from "@/lib/utils";
import { useStoreSettings, whatsappLink } from "@/lib/useStoreSettings";

export default function ProductDetail() {
  const { id } = useParams();
  const { product, loading: isLoading } = useProduct(id);
  const { addToCart } = useCart();
  const { whatsapp } = useStoreSettings();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  const { products: related = [] } = useProducts({ category: product?.category, limit: 5 });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12">
          <div className="aspect-square bg-london animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 bg-london animate-pulse w-3/4" />
            <div className="h-6 bg-london animate-pulse w-1/4" />
            <div className="h-24 bg-london animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h1 className="font-heading text-3xl font-bold mb-4">Product not found</h1>
        <Link to="/shop" className="text-pink font-semibold hover:underline">Back to Shop</Link>
      </div>
    );
  }

  const compareAtPrice = Number(product.compare_at_price);
  const effectivePrice = Number(product.price);
  const onSale = Number.isFinite(compareAtPrice) && compareAtPrice > effectivePrice;
  const inStock = product.stock > 0;
  const images = product.images?.length ? product.images : [];
  const interestLink = whatsappLink(
    whatsapp,
    `Hi, I’m interested in ${product.name}. Please let me know when it is back in stock.`
  );

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const relatedProducts = (related || []).filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div className="bg-white">
      {/* Breadcrumb */}
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-pink">Home</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/shop" className="hover:text-pink">Shop</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-pink">{product.category}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-carbon font-medium truncate">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-carbon transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Images */}
          <div>
            <div className="relative aspect-square bg-london overflow-hidden mb-4">
              <Image src={images[activeImage]} alt={product.name} className="w-full h-full object-cover" fittingType="fill" />
              {onSale && (
                <span className="absolute top-4 left-4 bg-pink text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5">Sale</span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-3">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={cn("w-20 h-20 overflow-hidden border-2 transition-colors", activeImage === i ? "border-pink" : "border-border hover:border-carbon")}
                  >
                    <Image src={img} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" fittingType="fill" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-pink font-semibold mb-2">{product.category}</p>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-carbon mb-4 leading-tight">{product.name}</h1>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="font-heading text-3xl font-bold text-carbon">₵{effectivePrice.toFixed(2)}</span>
              {onSale && <span className="text-xl text-muted-foreground line-through">₵{compareAtPrice.toFixed(2)}</span>}
            </div>

            {/* Authenticity block */}
            <div className="bg-london/50 border border-border p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-pink" />
                <span className="text-sm font-semibold text-carbon">UK-Sourced Authenticity</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {product.uk_origin ? `Sourced from ${product.uk_origin}` : "Sourced from trusted UK retailers"} • Delivered to Ghana
              </p>
            </div>

            {/* Stock status */}
            <div className="flex items-center gap-2 mb-6">
              {inStock ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-700">In Stock{product.stock <= 5 ? ` — Only ${product.stock} left` : ""}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-pink" />
                  <span className="text-sm font-medium text-muted-foreground">Out of stock</span>
                </>
              )}
            </div>

            {product.description && (
              <div className="mb-6">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-carbon mb-2">Description</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</p>
              </div>
            )}

            {product.sku && (
              <p className="text-xs text-muted-foreground mb-6">SKU: {product.sku}</p>
            )}

            {/* Purchase or availability request */}
            {inStock ? <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex items-center border border-border">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-12 h-12 flex items-center justify-center hover:bg-london transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  className="w-12 h-12 flex items-center justify-center hover:bg-london transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleAddToCart}
                className={cn(
                  "flex-1 h-12 flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-sm transition-colors",
                  added ? "bg-green-600 text-white" : "bg-carbon text-white hover:bg-pink"
                )}
              >
                {added ? <><Check className="w-4 h-4" /> Added to Cart</> : <><ShoppingBag className="w-4 h-4" /> Add to Cart</>}
              </button>
            </div> : <a href={interestLink} target="_blank" rel="noopener noreferrer" className="w-full h-12 flex items-center justify-center gap-2 bg-pink text-white font-bold uppercase tracking-wider text-sm hover:bg-carbon transition-colors mb-6"><MessageCircle className="w-4 h-4" /> I’m Interested — Ask When Available</a>}

            {/* Trust badges */}
            <div className="grid grid-cols-2 gap-3 pt-6 border-t border-border">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-pink" />
                <span className="text-xs text-muted-foreground">Ghana-wide delivery</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-pink" />
                <span className="text-xs text-muted-foreground">100% original product</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews */}
        <ReviewSection productId={product.id} />

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className="mt-20">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-carbon mb-8">You May Also Like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
