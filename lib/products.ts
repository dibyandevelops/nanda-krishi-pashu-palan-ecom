export type Product = {
  id: string;
  name: string;
  description: string;
  unit: string;
  price: number;
  image: string;
  badge: string;
};

export const products: Product[] = [
  {
    id: "milk-1l",
    name: "Fresh Cow Milk",
    description: "Morning-milked, chilled, and sealed for daily nutrition.",
    unit: "1 Liter",
    price: 110,
    image: "🥛",
    badge: "Daily Essential",
  },
  {
    id: "curd-kg",
    name: "Thick Dahi",
    description: "Farm-style curd with natural fermentation and rich texture.",
    unit: "1 Kg",
    price: 180,
    image: "🍶",
    badge: "Best Seller",
  },
  {
    id: "paneer-500g",
    name: "Soft Paneer",
    description: "Hand-pressed paneer for curries, snacks, and healthy meals.",
    unit: "500 g",
    price: 500,
    image: "🧀",
    badge: "Chef Choice",
  },
  {
    id: "ghee-500ml",
    name: "Desi Ghee",
    description: "Slow-cooked clarified butter with deep aroma and purity.",
    unit: "500 ml",
    price: 700,
    image: "🫙",
    badge: "Premium",
  },
];
