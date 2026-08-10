export type Role = "buyer" | "seller";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  isAdmin?: boolean;
}

export interface Offer {
  id: string;
  game: string;
  type: string;
  title: string;
  price: number;
  delivery: string;
  seller: string;
  sellerId: string;
  verified?: boolean;
  rating?: string;
  paused?: boolean;
}

export interface Order {
  id: string;
  buyerId: string;
  sellerId: string;
  buyer: string;
  seller: string;
  productTitle: string;
  productGame: string;
  productType: string;
  productDelivery: string;
  amount: number;
  paymentAmountUsdt?: number;
  status: string;
  createdAt: string;
  depositAddress?: string;
}

export interface Message {
  id: string;
  senderId: string;
  sender: string;
  text: string;
  createdAt: string;
}
