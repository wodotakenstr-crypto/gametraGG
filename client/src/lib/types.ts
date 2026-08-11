export type Role = "buyer" | "seller";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  isAdmin?: boolean;
  verified?: boolean;
  verificationRequested?: boolean;
  foundingSeller?: boolean;
}

export interface WalletCredit {
  id: string;
  productTitle: string;
  grossUsdt: number;
  commissionUsdt: number;
  paypalMerchantFeeUsdt?: number;
  netUsdt: number;
  creditedAt: string;
}

export interface Withdrawal {
  id: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  address: string;
  status: string;
  createdAt: string;
  payoutTxId?: string;
}

export interface Wallet {
  availableUsdt: number;
  pendingUsdt: number;
  withdrawalAddress?: string;
  credits: WalletCredit[];
  withdrawals: Withdrawal[];
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
  paypalSandboxAvailable?: boolean;
  paypalEnvironment?: "sandbox" | "live";
  paypalBuyerChargeUsd?: string;
  grossUsdt?: number;
  commissionUsdt?: number;
  paypalMerchantFeeUsdt?: number;
  sellerNetUsdt?: number;
  walletCreditedAt?: string;
  reviewedByBuyer?: boolean;
  review?: { buyer: string; rating: number; comment: string; createdAt: string } | null;
}

export interface Message {
  id: string;
  senderId: string;
  sender: string;
  text: string;
  createdAt: string;
}
