import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { Liquidity, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config({ path: '/workspace/eliza/.env' });
console.log("Loaded PRIVATE_KEY_BOT1:", process.env.PRIVATE_KEY_BOT1 ? "Key exists" : "Key missing");
console.log("Raw PRIVATE_KEY_BOT1:", process.env.PRIVATE_KEY_BOT1);
console.log("PRIVATE_KEY_BOT1 Length:", process.env.PRIVATE_KEY_BOT1.length);
console.log("PRIVATE_KEY_BOT1 Characters:", process.env.PRIVATE_KEY_BOT1.split('').map(c => c.charCodeAt(0)));

async function main() {
  const Sentiment = await import('vader-sentiment');
  const sentiment = Sentiment.SentimentIntensityAnalyzer;

  // Decode the private key and verify its length
  let decodedKey;
  try {
    decodedKey = bs58.decode(process.env.PRIVATE_KEY_BOT1);
    console.log("Decoded secret key length:", decodedKey.length);
    console.log("Decoded secret key bytes:", decodedKey);
  } catch (error) {
    throw new Error("Failed to decode secret key: " + error.message);
  }

  let wallet;
  if (decodedKey.length === 32) {
    console.log("Generating keypair from 32-byte secret key...");
    wallet = Keypair.fromSecretKey(decodedKey);
  } else if (decodedKey.length === 64) {
    console.log("Using 64-byte combined key...");
    wallet = Keypair.fromSecretKey(decodedKey);
  } else {
    throw new Error("Expected 32 or 64-byte secret key, got " + decodedKey.length + " bytes");
  }

  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  const TOKENS = [
    { name: "BONK", mint: new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"), poolId: new PublicKey("7yN93oKREeFoY83oL7bS5bWsyT4iLpfUN6JAZ9ZqKZC"), decimals: 5 },
    { name: "WIF", mint: new PublicKey("EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"), poolId: new PublicKey("ep2ib6dydeeqd8mfe2ezhcxx3kp3k2elkkirfpm5eymx"), decimals: 6 },
    { name: "POPCAT", mint: new PublicKey("7GCihgDB8feCmjBR3f2KYv83MVEx8JMxtUf7zFoKRoz1"), poolId: new PublicKey("frhb8l7y9qq41qzxyltc2nw8an1rjfllxrf2x9rwllmo"), decimals: 9 },
    { name: "MEW", mint: new PublicKey("MEW1gQS6F9M6zCJfAA81YHqeG8nLNn3SKR3X1MJbSRL"), poolId: new PublicKey("879f697iudjgmevrkrcnw21fcxiaeljk1ffsw2atebce"), decimals: 5 },
    { name: "GME", mint: new PublicKey("8wXtPeU6557ETkp9WHFY1nkj4S4t2k8UFhFWUAbDH6N"), poolId: new PublicKey("An5pCsmA9KqR7pCENWBox9k2EoWv5xA5rNaDArhSncC"), decimals: 9 },
  ];

  const BUY_THRESHOLD = 0.1; // Sentiment score for buying
  const SELL_THRESHOLD = -0.1; // Sentiment score for selling
  const TRADE_AMOUNT = 0.01; // 0.01 SOL per trade
  const PRICE_CHECK_INTERVAL = 300000; // 5 minutes

  const lastPrices = new Map();

  async function fetchTokenPrice(token) {
    try {
      const poolInfo = await Liquidity.fetchInfo({
        connection,
        poolId: token.poolId,
        programId: MAINNET_PROGRAM_ID.AmmV4,
      });
      const baseAmount = Number(poolInfo.baseReserve) / 10 ** token.decimals;
      const quoteAmount = Number(poolInfo.quoteReserve) / 10 ** 9;
      return quoteAmount / baseAmount; // Price in SOL per token
    } catch (error) {
      console.error(`Price error for ${token.name}:`, error);
      return null;
    }
  }

  async function buyToken(token, amount) {
    try {
      const tokenAccount = await getAssociatedTokenAddress(token.mint, wallet.publicKey);
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      if (!tokenAccountInfo) {
        const tx = new Transaction().add(
          createAssociatedTokenAccountInstruction(wallet.publicKey, tokenAccount, wallet.publicKey, token.mint)
        );
        await connection.sendTransaction(tx, [wallet]);
      }

      const poolKeys = await Liquidity.fetchInfo({
        connection,
        poolId: token.poolId,
        programId: MAINNET_PROGRAM_ID.AmmV4,
      });

      const swapTx = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys,
        userKeys: { tokenAccount, owner: wallet.publicKey },
        amountIn: amount * 10 ** 9,
        amountOut: 0,
        inputTokenMint: new PublicKey("So11111111111111111111111111111111111111112"),
        programId: MAINNET_PROGRAM_ID.AmmV4,
      });

      const txId = await connection.sendTransaction(swapTx.transaction, [wallet]);
      console.log(`Bought ${token.name} for ${amount} SOL. Tx: ${txId}`);
    } catch (error) {
      console.error(`Buy error for ${token.name}:`, error);
    }
  }

  async function sellToken(token) {
    try {
      const tokenAccount = await getAssociatedTokenAddress(token.mint, wallet.publicKey);
      const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccount);
      if (!tokenAccountInfo || tokenAccountInfo.value.amount <= 0) return;

      const amountToSell = tokenAccountInfo.value.amount;
      const poolKeys = await Liquidity.fetchInfo({
        connection,
        poolId: token.poolId,
        programId: MAINNET_PROGRAM_ID.AmmV4,
      });

      const swapTx = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys,
        userKeys: { tokenAccount, owner: wallet.publicKey },
        amountIn: amountToSell,
        amountOut: 0,
        inputTokenMint: token.mint,
        programId: MAINNET_PROGRAM_ID.AmmV4,
      });

      const txId = await connection.sendTransaction(swapTx.transaction, [wallet]);
      console.log(`Sold ${token.name}. Tx: ${txId}`);
    } catch (error) {
      console.error(`Sell error for ${token.name}:`, error);
    }
  }

  async function analyzeSentiment(posts) {
    let totalScore = 0;
    posts.forEach(post => {
      const score = sentiment.polarity_scores(post.text);
      totalScore += score.compound;
    });
    return totalScore / posts.length;
  }

  async function trade() {
    console.log("Starting sentiment-based trading bot...");
    while (true) {
      for (const token of TOKENS) {
        try {
          const posts = await x_search({
            query: `${token.name} OR $${token.name}`,
            from_date: "2025-05-10",
            to_date: "2025-05-11",
            search_type: "recent"
          });
          const sentimentScore = analyzeSentiment(posts);
          const currentPrice = await fetchTokenPrice(token);
          if (!currentPrice) continue;

          const lastPrice = lastPrices.get(token.name) || currentPrice;
          const balance = await connection.getBalance(wallet.publicKey) / 10 ** 9;

          if (sentimentScore > BUY_THRESHOLD && balance >= TRADE_AMOUNT) {
            console.log(`${token.name} sentiment: ${sentimentScore}, price: ${currentPrice} SOL, buying...`);
            await buyToken(token, TRADE_AMOUNT);
          } else if (sentimentScore < SELL_THRESHOLD) {
            console.log(`${token.name} sentiment: ${sentimentScore}, price: ${currentPrice} SOL, selling...`);
            await sellToken(token);
          } else {
            console.log(`${token.name} sentiment: ${sentimentScore}, price: ${currentPrice} SOL, no action.`);
          }

          lastPrices.set(token.name, currentPrice);
        } catch (error) {
          console.error(`Error processing ${token.name}:`, error);
        }
      }
      await new Promise(resolve => setTimeout(resolve, PRICE_CHECK_INTERVAL));
    }
  }

  trade().catch(error => console.error("Bot error:", error));
}

main().catch(error => console.error("Bot error:", error));