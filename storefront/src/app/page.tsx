"use client";

import { useMemo, useState } from "react";
import {
  FiArrowRight,
  FiCheck,
  FiChevronRight,
  FiGift,
  FiHeadphones,
  FiHeart,
  FiHome,
  FiMenu,
  FiSearch,
  FiShield,
  FiShoppingBag,
  FiShoppingCart,
  FiStar,
  FiSun,
  FiTruck,
  FiUser,
  FiX,
  FiZap,
} from "react-icons/fi";
import toast from "react-hot-toast";

type CategoryName =
  | "All"
  | "Fashion"
  | "Electronics"
  | "Home"
  | "Beauty"
  | "Footwear"
  | "Accessories";

type Category = {
  name: CategoryName;
  icon: typeof FiGift;
  gradient: string;
};

type Product = {
  id: number;
  name: string;
  category: Exclude<CategoryName, "All">;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  discount: string;
  image: string;
  background: string;
  tag: string;
};

type Filter = "Featured" | "Under ₹1,000";

const categories: Category[] = [
  { name: "All", icon: FiGift, gradient: "from-violet-400 to-fuchsia-400" },
  { name: "Fashion", icon: FiShoppingBag, gradient: "from-pink-400 to-rose-400" },
  { name: "Electronics", icon: FiHeadphones, gradient: "from-blue-400 to-cyan-400" },
  { name: "Home", icon: FiHome, gradient: "from-amber-300 to-orange-400" },
  { name: "Beauty", icon: FiSun, gradient: "from-fuchsia-400 to-purple-400" },
  { name: "Footwear", icon: FiShoppingBag, gradient: "from-emerald-400 to-teal-400" },
  { name: "Accessories", icon: FiShoppingBag, gradient: "from-orange-300 to-pink-400" },
];

const products: Product[] = [
  {
    id: 1,
    name: "Everyday Classic Sneakers",
    category: "Footwear",
    price: 1499,
    originalPrice: 2999,
    rating: 4.6,
    reviews: 1284,
    discount: "50% OFF",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=85",
    background: "bg-rose-50",
    tag: "BESTSELLER",
  },
  {
    id: 2,
    name: "Wireless Studio Headphones",
    category: "Electronics",
    price: 2499,
    originalPrice: 4999,
    rating: 4.8,
    reviews: 892,
    discount: "50% OFF",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85",
    background: "bg-blue-50",
    tag: "TOP RATED",
  },
  {
    id: 3,
    name: "Minimal Everyday Handbag",
    category: "Accessories",
    price: 1899,
    originalPrice: 3499,
    rating: 4.5,
    reviews: 567,
    discount: "46% OFF",
    image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=700&q=85",
    background: "bg-orange-50",
    tag: "TRENDING",
  },
  {
    id: 4,
    name: "Glow Essentials Skincare Set",
    category: "Beauty",
    price: 799,
    originalPrice: 1499,
    rating: 4.7,
    reviews: 2103,
    discount: "47% OFF",
    image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=700&q=85",
    background: "bg-pink-50",
    tag: "CUSTOMER FAVOURITE",
  },
  {
    id: 5,
    name: "Premium Everyday T-Shirt",
    category: "Fashion",
    price: 599,
    originalPrice: 1199,
    rating: 4.4,
    reviews: 734,
    discount: "50% OFF",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=85",
    background: "bg-purple-50",
    tag: "GREAT VALUE",
  },
  {
    id: 6,
    name: "Modern Ceramic Table Lamp",
    category: "Home",
    price: 1299,
    originalPrice: 2299,
    rating: 4.6,
    reviews: 421,
    discount: "43% OFF",
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=700&q=85",
    background: "bg-amber-50",
    tag: "HOME PICK",
  },
  {
    id: 7,
    name: "Smart Everyday Watch",
    category: "Electronics",
    price: 3299,
    originalPrice: 5999,
    rating: 4.7,
    reviews: 1567,
    discount: "45% OFF",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85",
    background: "bg-cyan-50",
    tag: "POPULAR",
  },
  {
    id: 8,
    name: "Statement Sunglasses",
    category: "Accessories",
    price: 699,
    originalPrice: 1399,
    rating: 4.3,
    reviews: 346,
    discount: "50% OFF",
    image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=700&q=85",
    background: "bg-emerald-50",
    tag: "UNDER ₹1,000",
  },
];

const formatPrice = (price: number): string =>
  `₹${price.toLocaleString("en-IN")}`;

export default function HomePage() {
  const [search, setSearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryName>("All");
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [cart, setCart] = useState<number[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter>("Featured");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);

      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const matchesPrice =
        activeFilter !== "Under ₹1,000" || product.price < 1000;

      return matchesSearch && matchesCategory && matchesPrice;
    });
  }, [search, selectedCategory, activeFilter]);

  const scrollToProducts = () => {
    document.getElementById("products")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const selectCategory = (category: CategoryName) => {
    setSelectedCategory(category);
    setActiveFilter("Featured");
    setMobileMenuOpen(false);
    scrollToProducts();
  };

  const resetFilters = () => {
    setSearch("");
    setSelectedCategory("All");
    setActiveFilter("Featured");
  };

  const toggleWishlist = (productId: number, productName: string) => {
    const isSaved = wishlist.includes(productId);

    setWishlist((current) =>
      isSaved
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );

    if (isSaved) {
      toast("Removed from your wishlist");
    } else {
      toast.success(`${productName} added to wishlist`);
    }
  };

  const addToCart = (productId: number, productName: string) => {
    setCart((current) => [...current, productId]);
    toast.success(`${productName} added to cart`);
  };

  const showCart = () => {
    if (cart.length === 0) {
      toast("Your cart is empty. Find something you love!");
      return;
    }

    toast.success(`${cart.length} item(s) in your cart`);
  };

  const showWishlist = () => {
    if (wishlist.length === 0) {
      toast("Your wishlist is waiting for some love!");
      return;
    }

    toast.success(`${wishlist.length} saved product(s)`);
  };

  const showDeals = () => {
    setSelectedCategory("All");
    setActiveFilter("Under ₹1,000");
    scrollToProducts();
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f8fc] text-slate-900">
      {/* Announcement bar */}
      <div className="gradient-promo px-4 py-2.5 text-center text-xs font-semibold text-white sm:text-sm">
        <FiZap className="mr-2 inline-block" size={16} />
        THE BIG STYLE SALE IS HERE — UP TO 50% OFF
        <span className="mx-2 hidden sm:inline">|</span>
        <span className="hidden sm:inline">
          Free delivery on orders over ₹999
        </span>
        <FiArrowRight className="ml-2 inline-block" size={15} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <button
            type="button"
            aria-label="Toggle navigation"
            className="rounded-xl p-2 transition hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
          </button>

          <button
            type="button"
            onClick={() => {
              resetFilters();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="shrink-0 text-left"
            aria-label="Go to homepage"
          >
            <span className="flex items-center gap-2">
              <span className="gradient-promo flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg shadow-fuchsia-200">
                <FiShoppingBag size={21} />
              </span>
              <span className="text-2xl font-black tracking-tight">
                shop<span className="text-fuchsia-600">sphere</span>
                <span className="text-fuchsia-600">.</span>
              </span>
            </span>
          </button>

          <div className="relative mx-auto hidden max-w-xl flex-1 md:block">
            <FiSearch
              className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
              size={19}
            />
            <input
              aria-label="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search for products, brands and more..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-5 pl-12 text-sm outline-none transition focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200"
              >
                <FiX size={16} />
              </button>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={showWishlist}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-pink-50 hover:text-pink-600 sm:h-11 sm:w-11"
              aria-label={`Wishlist, ${wishlist.length} items`}
            >
              <FiHeart size={21} />
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-bold text-white">
                  {wishlist.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={showCart}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-violet-50 hover:text-violet-600 sm:h-11 sm:w-11"
              aria-label={`Shopping cart, ${cart.length} items`}
            >
              <FiShoppingCart size={21} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
                  {cart.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => toast("Sign-in will be available soon.")}
              className="hidden items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-600 sm:flex"
            >
              <FiUser size={17} />
              Sign in
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <div className="px-4 pb-3 md:hidden">
          <div className="relative">
            <FiSearch
              className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              aria-label="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products and brands..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-4 pl-11 text-sm outline-none focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100"
            />
          </div>
        </div>

        {/* Desktop categories */}
        <nav
          aria-label="Product categories"
          className="hidden border-t border-slate-100 lg:block"
        >
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-10">
            {categories.map((category) => {
              const CategoryIcon = category.icon;

              return (
                <button
                  type="button"
                  key={category.name}
                  onClick={() => selectCategory(category.name)}
                  className={`relative flex items-center gap-2 py-4 text-sm font-semibold transition ${
                    selectedCategory === category.name
                      ? "text-fuchsia-600"
                      : "text-slate-600 hover:text-fuchsia-600"
                  }`}
                >
                  <CategoryIcon size={17} />
                  {category.name === "All"
                    ? "All products"
                    : category.name}
                  {selectedCategory === category.name && (
                    <span className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-fuchsia-500" />
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={showDeals}
              className="flex items-center gap-1 py-4 text-sm font-bold text-orange-500 transition hover:text-orange-600"
            >
              <FiZap size={16} />
              Deals
              <FiChevronRight size={14} />
            </button>
          </div>
        </nav>

        {/* Mobile categories */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile product categories"
            className="border-t border-slate-100 bg-white p-4 shadow-lg lg:hidden"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((category) => {
                const CategoryIcon = category.icon;

                return (
                  <button
                    type="button"
                    key={category.name}
                    onClick={() => selectCategory(category.name)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${
                      selectedCategory === category.name
                        ? "bg-fuchsia-50 text-fuchsia-600"
                        : "bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <CategoryIcon size={18} />
                    {category.name}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10">
        <div className="gradient-promo relative mx-auto max-w-[1360px] overflow-hidden rounded-[28px] text-white shadow-xl shadow-purple-200/60 sm:rounded-[36px]">
          <div className="absolute -top-28 -right-20 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-pink-300/20 blur-3xl" />
          <div className="absolute top-12 right-1/3 h-24 w-24 rounded-full border border-white/20" />
          <div className="absolute right-1/4 bottom-10 h-12 w-12 rounded-full border border-white/20" />

          <div className="relative grid min-h-[390px] items-center gap-6 px-6 py-12 sm:px-10 md:grid-cols-[1.1fr_0.9fr] md:px-14 lg:min-h-[490px] lg:px-20 lg:py-16">
            <div className="fade-up z-10 max-w-2xl">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-bold tracking-[0.15em] backdrop-blur-md sm:text-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-300" />
                YOUR NEXT FAVOURITE THING IS HERE
              </span>

              <h1 className="max-w-2xl text-4xl leading-[1.08] font-black tracking-tight sm:text-5xl md:text-5xl lg:text-7xl">
                Big finds.
                <br />
                <span className="text-yellow-300">Little prices.</span>
                <br />
                Endless you.
              </h1>

              <p className="mt-5 max-w-lg text-sm leading-7 text-white/85 sm:text-base sm:leading-8">
                Your everyday favourites, trending discoveries and little
                luxuries — all in one happy place.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("All");
                    setActiveFilter("Featured");
                    scrollToProducts();
                  }}
                  className="group inline-flex items-center gap-3 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-fuchsia-700 shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
                >
                  Explore collection
                  <FiArrowRight
                    className="transition group-hover:translate-x-1"
                    size={18}
                  />
                </button>

                <button
                  type="button"
                  onClick={showDeals}
                  className="rounded-2xl border border-white/40 bg-white/10 px-6 py-4 text-sm font-bold backdrop-blur-sm transition hover:bg-white/20"
                >
                  Shop under ₹1,000
                </button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4 text-xs font-medium text-white/90 sm:gap-6 sm:text-sm">
                <span className="flex items-center gap-2">
                  <FiCheck size={17} /> Curated finds
                </span>
                <span className="flex items-center gap-2">
                  <FiCheck size={17} /> Amazing deals
                </span>
                <span className="flex items-center gap-2">
                  <FiCheck size={17} /> Everyday style
                </span>
              </div>
            </div>

            <div className="relative mx-auto hidden h-[340px] w-full max-w-[450px] md:block lg:h-[390px]">
              <div className="float-gentle absolute top-5 left-12 flex h-52 w-52 items-center justify-center rounded-[40px] bg-gradient-to-br from-yellow-200 to-orange-300 text-fuchsia-800 shadow-2xl shadow-purple-950/20 lg:left-16 lg:h-64 lg:w-64">
                <FiShoppingBag size={120} strokeWidth={1.1} />
              </div>

              <div className="float-delayed absolute right-3 bottom-1 flex h-40 w-40 items-center justify-center rounded-[32px] border border-white/50 bg-white/20 text-white shadow-xl backdrop-blur-xl lg:right-0 lg:h-48 lg:w-48">
                <FiHeadphones size={88} strokeWidth={1.1} />
              </div>

              <div className="offer-pulse absolute top-0 right-5 flex h-24 w-24 rotate-12 flex-col items-center justify-center rounded-full bg-yellow-300 text-center text-fuchsia-800 shadow-xl lg:right-4 lg:h-28 lg:w-28">
                <span className="text-2xl leading-none font-black lg:text-3xl">
                  50%
                </span>
                <span className="mt-1 text-[10px] font-extrabold tracking-wider">
                  OFF
                </span>
              </div>

              <div className="float-gentle absolute bottom-7 left-0 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-white shadow-lg backdrop-blur-md">
                <FiStar size={30} />
              </div>

              <div className="absolute top-1/2 right-0 rounded-2xl border border-white/30 bg-white/20 px-4 py-3 shadow-lg backdrop-blur-lg">
                <p className="text-xs font-medium text-white/80">
                  Little things,
                </p>
                <p className="text-sm font-black">Big happiness</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto grid max-w-[1360px] grid-cols-2 gap-3 px-4 py-8 sm:px-6 md:grid-cols-4 lg:px-10">
        {[
          {
            icon: FiTruck,
            title: "Easy delivery",
            subtitle: "Straight to your door",
            color: "bg-blue-100 text-blue-600",
          },
          {
            icon: FiShield,
            title: "Secure shopping",
            subtitle: "Shop with confidence",
            color: "bg-emerald-100 text-emerald-600",
          },
          {
            icon: FiShoppingBag,
            title: "Curated products",
            subtitle: "Find your favourites",
            color: "bg-pink-100 text-pink-600",
          },
          {
            icon: FiGift,
            title: "Everyday deals",
            subtitle: "More for your money",
            color: "bg-amber-100 text-amber-600",
          },
        ].map((benefit) => {
          const BenefitIcon = benefit.icon;

          return (
            <div
              key={benefit.title}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:p-5"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${benefit.color}`}
              >
                <BenefitIcon size={23} />
              </span>
              <span>
                <span className="block text-sm font-bold">
                  {benefit.title}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {benefit.subtitle}
                </span>
              </span>
            </div>
          );
        })}
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-[1360px] px-4 py-4 sm:px-6 lg:px-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.18em] text-fuchsia-600 uppercase">
              Explore your style
            </p>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
              Shop by category
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              A little something for every part of your life.
            </p>
          </div>

          <button
            type="button"
            onClick={() => selectCategory("All")}
            className="hidden items-center gap-2 text-sm font-bold text-fuchsia-600 transition hover:gap-3 sm:flex"
          >
            View all <FiArrowRight size={17} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {categories
            .filter((category) => category.name !== "All")
            .map((category) => {
              const CategoryIcon = category.icon;

              return (
                <button
                  type="button"
                  key={category.name}
                  onClick={() => selectCategory(category.name)}
                  className={`category-tile group relative overflow-hidden rounded-2xl bg-gradient-to-br ${category.gradient} p-4 text-left text-white shadow-sm sm:rounded-3xl sm:p-5 ${
                    selectedCategory === category.name
                      ? "ring-4 ring-fuchsia-200"
                      : ""
                  }`}
                >
                  <span className="absolute -right-5 -bottom-5 h-24 w-24 rounded-full bg-white/15 transition-transform duration-500 group-hover:scale-150" />

                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/20 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <CategoryIcon size={25} />
                  </span>

                  <span className="relative mt-5 block text-sm font-extrabold">
                    {category.name}
                  </span>

                  <span className="relative mt-1 flex items-center gap-1 text-xs text-white/80">
                    Explore <FiArrowRight size={12} />
                  </span>
                </button>
              );
            })}
        </div>
      </section>

      {/* Promotional banners */}
      <section className="mx-auto grid max-w-[1360px] gap-4 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-10">
        <div className="gradient-sunset relative overflow-hidden rounded-[28px] p-7 text-white sm:p-9">
          <div className="absolute -right-6 -bottom-10 opacity-20">
            <FiShoppingBag size={180} strokeWidth={1} />
          </div>

          <div className="relative">
            <span className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-[10px] font-extrabold tracking-widest">
              STYLE SPOTLIGHT
            </span>
            <h3 className="mt-5 max-w-xs text-3xl leading-tight font-black">
              Refresh your everyday look.
            </h3>
            <p className="mt-3 max-w-xs text-sm leading-6 text-white/85">
              New styles. Fresh colours. Prices you will love.
            </p>
            <button
              type="button"
              onClick={() => selectCategory("Fashion")}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-rose-600 transition hover:-translate-y-0.5"
            >
              Explore fashion <FiArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="gradient-ocean relative overflow-hidden rounded-[28px] p-7 text-white sm:p-9">
          <div className="absolute -right-6 -bottom-10 opacity-20">
            <FiHeadphones size={180} strokeWidth={1} />
          </div>

          <div className="relative">
            <span className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-[10px] font-extrabold tracking-widest">
              TECH YOU WILL LOVE
            </span>
            <h3 className="mt-5 max-w-xs text-3xl leading-tight font-black">
              Upgrade your everyday.
            </h3>
            <p className="mt-3 max-w-xs text-sm leading-6 text-white/85">
              Smart picks and useful tech, without the big price tag.
            </p>
            <button
              type="button"
              onClick={() => selectCategory("Electronics")}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-600 transition hover:-translate-y-0.5"
            >
              Explore electronics <FiArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Products */}
      <section
        id="products"
        className="mx-auto max-w-[1360px] scroll-mt-40 px-4 py-8 sm:px-6 lg:px-10"
      >
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.18em] text-fuchsia-600 uppercase">
              Picked just for you
            </p>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
              {activeFilter === "Under ₹1,000"
                ? "Little prices, big finds"
                : selectedCategory === "All"
                  ? "Trending right now"
                  : `${selectedCategory} favourites`}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {filteredProducts.length} products to discover
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["Featured", "Under ₹1,000"] as const).map((filter) => (
              <button
                type="button"
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
                  activeFilter === filter
                    ? "bg-slate-900 text-white shadow-md"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-fuchsia-300 hover:text-fuchsia-600"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {filteredProducts.map((product, index) => {
              const isWishlisted = wishlist.includes(product.id);

              return (
                <article
                  key={product.id}
                  className="product-card group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm sm:rounded-[24px]"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div
                    className={`relative aspect-[4/4.2] overflow-hidden ${product.background}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image}
                      alt={product.name}
                      loading={index > 3 ? "lazy" : "eager"}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />

                    <span className="absolute top-3 left-3 rounded-lg bg-white/95 px-2 py-1.5 text-[9px] font-extrabold tracking-wider text-slate-800 shadow-sm sm:text-[10px]">
                      {product.tag}
                    </span>

                    <span className="absolute bottom-3 left-3 rounded-lg bg-rose-500 px-2 py-1.5 text-[10px] font-extrabold text-white shadow-md">
                      {product.discount}
                    </span>

                    <button
                      type="button"
                      aria-label={
                        isWishlisted
                          ? `Remove ${product.name} from wishlist`
                          : `Add ${product.name} to wishlist`
                      }
                      onClick={() =>
                        toggleWishlist(product.id, product.name)
                      }
                      className={`absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full shadow-md backdrop-blur-md transition hover:scale-110 ${
                        isWishlisted
                          ? "bg-pink-500 text-white"
                          : "bg-white/95 text-slate-700 hover:bg-pink-50 hover:text-pink-600"
                      }`}
                    >
                      <FiHeart
                        size={17}
                        fill={isWishlisted ? "currentColor" : "none"}
                      />
                    </button>
                  </div>

                  <div className="p-3 sm:p-5">
                    <p className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase sm:text-xs">
                      {product.category}
                    </p>

                    <h3 className="line-clamp-2 min-h-10 text-sm leading-5 font-bold text-slate-800 transition group-hover:text-fuchsia-600 sm:text-base">
                      {product.name}
                    </h3>

                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-1 text-[10px] font-bold text-emerald-700 sm:text-xs">
                        {product.rating}
                        <FiStar size={11} fill="currentColor" />
                      </span>
                      <span className="text-[10px] text-slate-400 sm:text-xs">
                        ({product.reviews.toLocaleString("en-IN")})
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-base font-black text-slate-900 sm:text-xl">
                        {formatPrice(product.price)}
                      </span>
                      <span className="text-xs text-slate-400 line-through sm:text-sm">
                        {formatPrice(product.originalPrice)}
                      </span>
                    </div>

                    <p className="mt-1 text-[10px] font-semibold text-emerald-600 sm:text-xs">
                      You save{" "}
                      {formatPrice(product.originalPrice - product.price)}
                    </p>

                    <button
                      type="button"
                      onClick={() => addToCart(product.id, product.name)}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-xs font-bold text-white transition hover:bg-fuchsia-600 active:scale-[0.98] sm:text-sm"
                    >
                      <FiShoppingCart size={16} />
                      Add to cart
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-fuchsia-50 text-fuchsia-500">
              <FiSearch size={30} />
            </span>
            <h3 className="mt-5 text-xl font-black">No products found</h3>
            <p className="mt-2 text-sm text-slate-500">
              Try another search or explore all our products.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-6 rounded-xl bg-fuchsia-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-fuchsia-700"
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => {
              resetFilters();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:border-fuchsia-300 hover:text-fuchsia-600"
          >
            Explore all products <FiArrowRight size={17} />
          </button>
        </div>
      </section>

      {/* Closing banner */}
      <section className="px-4 py-10 sm:px-6 lg:px-10">
        <div className="gradient-sunset relative mx-auto max-w-[1360px] overflow-hidden rounded-[28px] px-6 py-12 text-center text-white sm:rounded-[36px] sm:px-12 sm:py-16">
          <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -right-16 -bottom-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />

          <div className="relative">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/30 bg-white/15">
              <FiShoppingBag size={28} />
            </span>
            <h2 className="mt-5 text-3xl font-black sm:text-4xl">
              Good finds. Great feelings.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/85 sm:text-base">
              Discover your next favourite and make everyday shopping a little
              more exciting.
            </p>
            <button
              type="button"
              onClick={() => {
                resetFilters();
                scrollToProducts();
              }}
              className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-rose-600 shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
            >
              Start exploring <FiArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1360px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-10">
          <div className="md:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2">
              <span className="gradient-promo flex h-9 w-9 items-center justify-center rounded-xl text-white">
                <FiShoppingBag size={19} />
              </span>
              <span className="text-xl font-black">
                shop<span className="text-fuchsia-600">sphere</span>.
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
              Discover everyday essentials, trending styles and delightful
              deals — all in one place.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-extrabold">Explore</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-500">
              {(
                ["Fashion", "Electronics", "Home", "Beauty"] as CategoryName[]
              ).map((category) => (
                <button
                  type="button"
                  key={category}
                  onClick={() => selectCategory(category)}
                  className="block transition hover:text-fuchsia-600"
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-extrabold">Customer care</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-500">
              <p>Help centre</p>
              <p>Shipping information</p>
              <p>Returns and refunds</p>
              <p>Contact us</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-extrabold">Stay in the loop</h3>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              A little inspiration and a lot of great finds.
            </p>

            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                toast.success("Thanks for your interest!");
              }}
            >
              <input
                aria-label="Email address"
                type="email"
                required
                placeholder="Your email address"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs outline-none focus:border-fuchsia-400"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fuchsia-600 text-white transition hover:bg-fuchsia-700"
              >
                <FiArrowRight size={19} />
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-5 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} ShopSphere. Made for everyday discovery.
        </div>
      </footer>
    </main>
  );
}