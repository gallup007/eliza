import fetch from 'node-fetch';

async function findBonkPools() {
  const response = await fetch('https://api.raydium.io/v2/sdk/liquidity/mainnet.json');
  const data = await response.json();
  const pools = [...data.official, ...data.unOfficial];
  const bonkMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
  const solMint = 'So11111111111111111111111111111111111111112';
  const bonkPools = pools.filter(
    (p) =>
      (p.baseMint === bonkMint && p.quoteMint === solMint) ||
      (p.baseMint === solMint && p.quoteMint === bonkMint)
  );
  bonkPools.forEach((pool) => {
    console.log(`Pool ID: ${pool.id}, Official: ${data.official.includes(pool)}, Base: ${pool.baseMint}, Quote: ${pool.quoteMint}, Program: ${pool.programId}`);
  });
}

findBonkPools();
