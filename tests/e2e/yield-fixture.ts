/** A small screener snapshot for browser interception. Not live data. */
export const USDY = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
export const TSLAX = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
export const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL = 'So11111111111111111111111111111111111111112';
const pool = (mint: string, address: string, pair: string, tokenSymbol: string, counterSymbol: string, counterMint: string, tvlUsd: number, feeApyPct: number, binStep: number) => ({
  mint, address, pair, tokenSymbol, counterSymbol, counterMint, counterVerified: true, tvlUsd, volume24hUsd: tvlUsd / 3, fees24hUsd: tvlUsd / 500,
  feeTvl24hPct: 0.2, feeApyPct, farmApyPct: null, binStep, baseFeePct: binStep / 100, meteoraUrl: `https://app.meteora.ag/dlmm/${address}`,
});
export const screenerFixture = {
  state: 'ok', fetchedAt: '2026-09-28T12:00:00.000Z', catalogSize: 1075, stale: false,
  assets: [
    { mint: USDY, symbol: 'USDY', name: 'Ondo US Dollar Yield', issuer: 'Ondo', underlying: null, market: null, reserveProofUrl: 'https://ondo.finance/usdy' },
    { mint: TSLAX, symbol: 'TSLAx', name: 'Tesla xStock', issuer: 'xStocks', underlying: 'TSLA', market: 'open', reserveProofUrl: null },
    { mint: NVDAX, symbol: 'NVDAx', name: 'NVIDIA xStock', issuer: 'xStocks', underlying: 'NVDA', market: 'halted', reserveProofUrl: null },
  ],
  pools: [
    pool(NVDAX, 'FCn5zw4gAcfRpQgst5ThFuzBGXbbJ6RocVErgC4vJ9j1', 'NVDAx-SOL', 'NVDAx', 'SOL', SOL, 121199, 18.2, 20),
    pool(TSLAX, 'CHGfdEfKFYDWGPASCsZnpkDzvpLKNEVoAb4UEorPPkGK', 'TSLAx-SOL', 'TSLAx', 'SOL', SOL, 6193, 40, 20),
    pool(USDY, '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie', 'USDY-USDC', 'USDY', 'USDC', USDC, 1743, 2.8, 1),
    pool(TSLAX, 'BCZLEgknvcyCsJ9ERRN38U4gBTNn4ftU11fEtV3XHnK2', 'TSLAx-USDC', 'TSLAx', 'USDC', USDC, 928, 15894, 50),
  ],
};
