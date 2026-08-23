export type ExchangeField = "apiKey" | "apiSecret" | "passphrase";

export interface ExchangeProvider {
  id: string;
  name: string;
  environments: ("mainnet" | "testnet")[];
  fields: ExchangeField[];
  capabilities: {
    marketData: boolean;
    trading: boolean;
  };
}

export const ExchangeRegistry: ExchangeProvider[] = [
  {
    id: "binance",
    name: "Binance",
    environments: ["mainnet", "testnet"],
    fields: ["apiKey", "apiSecret"],
    capabilities: { marketData: true, trading: true }
  },
  {
    id: "bybit",
    name: "Bybit",
    environments: ["mainnet", "testnet"],
    fields: ["apiKey", "apiSecret"],
    capabilities: { marketData: true, trading: true }
  },
  {
    id: "coinbase",
    name: "Coinbase Advanced",
    environments: ["mainnet", "testnet"],
    fields: ["apiKey", "apiSecret", "passphrase"],
    capabilities: { marketData: true, trading: true }
  },
  {
    id: "okx",
    name: "OKX",
    environments: ["mainnet", "testnet"],
    fields: ["apiKey", "apiSecret", "passphrase"],
    capabilities: { marketData: true, trading: true }
  },
  {
    id: "kraken",
    name: "Kraken",
    environments: ["mainnet"],
    fields: ["apiKey", "apiSecret"],
    capabilities: { marketData: true, trading: true }
  },
  {
    id: "alpaca",
    name: "Alpaca",
    environments: ["mainnet", "testnet"],
    fields: ["apiKey", "apiSecret"],
    capabilities: { marketData: true, trading: true }
  }
];

export function getProviderById(id: string): ExchangeProvider | undefined {
  return ExchangeRegistry.find(p => p.id === id);
}
