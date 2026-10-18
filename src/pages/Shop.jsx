import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  SlidersHorizontal,
  X,
  Search,
  ArrowUpDown,
} from "lucide-react";

import ProductCard from "@/components/ProductCard";
import { useProducts } from "@/lib/useProducts";
import { CATEGORIES } from "@/lib/siteConfig";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || ""
  );

  const category = searchParams.get("category") || "";
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "newest";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";
  const filterTag = searchParams.get("filter") || "";

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const {
    products = [],
    loading,
    error,
  } = useProducts({
    limit: 200,
  });

  const filteredProducts = useMemo(() => {
    let items = [...products];

    // Category
    if (category) {
      items = items.filter(
        (product) =>
          product.category?.toLowerCase() === category.toLowerCase() ||
          product.category_slug?.toLowerCase() === category.toLowerCase()
      );
    }

    // Search
    if (search.trim()) {
      const query = search.trim().toLowerCase();

      items = items.filter((product) => {
        const name = product.name?.toLowerCase() || "";
        const description =
          product.description?.toLowerCase() || "";
        const productCategory =
          product.category?.toLowerCase() || "";

        return (
          name.includes(query) ||
          description.includes(query) ||
          productCategory.includes(query)
        );
      });
    }

    // Price
    if (minPrice !== "") {
      items = items.filter(
        (product) => Number(product.price || 0) >= Number(minPrice)
      );
    }

    if (maxPrice !== "") {
      items = items.filter(
        (product) => Number(product.price || 0) <= Number(maxPrice)
      );
    }

    // Quick filters
    if (filterTag === "best_seller") {
      items = items.filter((product) => product.best_seller);
    }

    if (filterTag === "new_arrival") {
      items = items.filter((product) => product.new_arrival);
    }

    if (filterTag === "special_offer") {
      items = items.filter(
        (product) =>
          product.special_offer ||
          (product.compare_at_price &&
            Number(product.compare_at_price) >
              Number(product.price || 0))
      );
    }

    // Sorting
    items.sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return (a.name || "").localeCompare(b.name || "");

        case "name-desc":
          return (b.name || "").localeCompare(a.name || "");

        case "price-asc":
          return Number(a.price || 0) - Number(b.price || 0);

        case "price-desc":
          return Number(b.price || 0) - Number(a.price || 0);

        case "newest":
        default:
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
      }
    });

    return items;
  }, [
    products,
    category,
    search,
    minPrice,
    maxPrice,
    filterTag,
    sort,
  ]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);

    if (key === "category") {
      next.delete("search");
      setSearchInput("");
    }

    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setSearchParams(next);
  };

  const handleSearch = (event) => {
    event.preventDefault();
    updateParam("search", searchInput.trim());
  };

  const clearFilters = () => {
    setSearchParams({});
    setSearchInput("");
  };

  const activeFilterCount = [
    category,
    search,
    minPrice,
    maxPrice,
    filterTag,
  ].filter(Boolean).length;

  const pageTitle =
    category ||
    (filterTag === "best_seller"
      ? "Best Sellers"
      : filterTag === "new_arrival"
        ? "New Arrivals"
        : filterTag === "special_offer"
          ? "Special Offers"
          : "All Products");

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <section className="border-b border-border bg-london/30">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-pink">
            The Collection
          </p>

          <h1 className="font-heading text-3xl font-bold text-carbon sm:text-4xl">
            {pageTitle}
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            {loading
              ? "Loading products..."
              : `${filteredProducts.length} product${
                  filteredProducts.length !== 1 ? "s" : ""
                } found`}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Toolbar */}
        <div className="mb-6 flex items-center gap-3">
          <form
            onSubmit={handleSearch}
            className="relative flex-1"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <label htmlFor="shop-search" className="sr-only">
              Search products
            </label>
            <input
              id="shop-search"
              name="search"
              type="text"
              value={searchInput}
              onChange={(event) =>
                setSearchInput(event.target.value)
              }
              placeholder="Search products..."
              className="w-full rounded-md border border-border bg-london py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-pink"
            />
          </form>

          <button
            type="button"
            onClick={() => setShowFilters(true)}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters

            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />

            <select
              aria-label="Sort products"
              value={sort}
              onChange={(event) =>
                updateParam("sort", event.target.value)
              }
              className="rounded-md border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink"
            >
              {SORT_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              updateParam(
                "filter",
                filterTag === "best_seller"
                  ? ""
                  : "best_seller"
              )
            }
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
              filterTag === "best_seller"
                ? "border-carbon bg-carbon text-white"
                : "border-border hover:border-carbon"
            )}
          >
            Best Sellers
          </button>

          <button
            type="button"
            onClick={() =>
              updateParam(
                "filter",
                filterTag === "new_arrival"
                  ? ""
                  : "new_arrival"
              )
            }
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
              filterTag === "new_arrival"
                ? "border-carbon bg-carbon text-white"
                : "border-border hover:border-carbon"
            )}
          >
            New Arrivals
          </button>

          <button
            type="button"
            onClick={() =>
              updateParam(
                "filter",
                filterTag === "special_offer"
                  ? ""
                  : "special_offer"
              )
            }
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
              filterTag === "special_offer"
                ? "border-pink bg-pink text-white"
                : "border-border hover:border-pink hover:text-pink"
            )}
          >
            Special Offers
          </button>
        </div>

        <div className="flex gap-8">
          {/* Desktop filters */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <FilterPanel
              category={category}
              minPrice={minPrice}
              maxPrice={maxPrice}
              updateParam={updateParam}
              clearFilters={clearFilters}
            />
          </aside>

          {/* Products */}
          <section className="min-w-0 flex-1">
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
                <h2 className="font-heading text-lg font-semibold text-red-700">
                  Could not load products
                </h2>

                <p className="mt-2 text-sm text-red-600">
                  Please refresh the page and try again.
                </p>
              </div>
            ) : loading ? (
              <div className="grid grid-cols-3 gap-2 sm:gap-6">
                {Array.from({ length: 9 }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="aspect-[3/4] animate-pulse bg-london"
                    />
                  )
                )}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-20 text-center">
                <p className="mb-2 font-heading text-lg font-semibold text-carbon">
                  {activeFilterCount > 0 ? "No products found" : "We’re updating our collection"}
                </p>

                <p className="mb-6 text-sm text-muted-foreground">
                  {activeFilterCount > 0
                    ? "Try changing your search or filters."
                    : "Please check back soon, or contact us if you’re looking for a particular product."}
                </p>

                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-md bg-carbon px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pink"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <Link
                    to="/contact"
                    className="inline-flex items-center rounded-md bg-carbon px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pink"
                  >
                    Contact Us
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-carbon/40"
            onClick={() => setShowFilters(false)}
          />

          <div className="absolute bottom-0 left-0 top-0 flex w-[85%] max-w-sm flex-col bg-white">
            <div className="flex items-center justify-between border-b border-border p-5">
              <h3 className="font-heading font-bold">
                Filters
              </h3>

              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-md p-2 hover:bg-london"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <FilterPanel
                category={category}
                minPrice={minPrice}
                maxPrice={maxPrice}
                updateParam={updateParam}
                clearFilters={clearFilters}
              />

              <div className="mt-6">
                <label htmlFor="shop-sort-mobile" className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  Sort By
                </label>

                <select
                  id="shop-sort-mobile"
                  value={sort}
                  onChange={(event) =>
                    updateParam(
                      "sort",
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border border-border bg-white px-4 py-2.5 text-sm"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-border p-5">
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="w-full rounded-md bg-carbon py-3 text-sm font-semibold text-white"
              >
                Show {filteredProducts.length} Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPanel({
  category,
  minPrice,
  maxPrice,
  updateParam,
  clearFilters,
}) {
  return (
    <div className="space-y-8">
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-carbon">
          Categories
        </h4>

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => updateParam("category", "")}
            className={cn(
              "block w-full py-1.5 text-left text-sm transition-colors",
              !category
                ? "font-semibold text-pink"
                : "text-muted-foreground hover:text-carbon"
            )}
          >
            All Categories
          </button>

          {CATEGORIES.map((cat) => (
            <button
              type="button"
              key={cat.slug}
              onClick={() =>
                updateParam("category", cat.slug)
              }
              className={cn(
                "block w-full py-1.5 text-left text-sm transition-colors",
                category === cat.slug
                  ? "font-semibold text-pink"
                  : "text-muted-foreground hover:text-carbon"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-carbon">
          Price Range (GHS)
        </h4>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            value={minPrice}
            onChange={(event) =>
              updateParam(
                "minPrice",
                event.target.value
              )
            }
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink"
          />

          <span className="text-muted-foreground">
            —
          </span>

          <input
            type="number"
            min="0"
            placeholder="Max"
            value={maxPrice}
            onChange={(event) =>
              updateParam(
                "maxPrice",
                event.target.value
              )
            }
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={clearFilters}
        className="text-xs font-semibold uppercase tracking-wider text-pink transition-colors hover:text-carbon"
      >
        Clear All Filters
      </button>
    </div>
  );
}
