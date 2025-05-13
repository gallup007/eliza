import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { Liquidity, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY_BOT1));

const TOKENS = [
  {
    name: "BONK",
    mint: new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
    poolId: new PublicKey("6nJaeBjC7zTkGskp3z1N4N5N8j9tW1zTw4W3wuhrpen"), // Updated BONK/SOL pool
    decimals: 5,
  },
];

const BUY_THRESHOLD = 0.97; // 3% dip
const SELL_THRESHOLD = 1.05; // 5% gain
const BUDGET_PER_TOKEN = 0.3; // ~$50 at $160/SOL
const PRICE_CHECK_INTERVAL = 10000; // 10 seconds

const lastPrices = new Map();

async function fetchTokenPrice(token) {
  try {
    // Fetch pool state using the updated Raydium SDK method
    const poolInfo = await Liquidity.fetchInfo({
      connection,
      poolId: token.poolId,
      programId: MAINNET_PROGRAM_ID.AmmV4,
    });

    // Calculate price: quoteReserve/baseReserve (SOL/BONK)
    const baseAmount = Number(poolInfo.baseReserve) / 10 ** token.decimals; // BONK
    const quoteAmount = Number(poolInfo.quoteReserve) / 10 ** 9; // SOL
    return quoteAmount / baseAmount; // Price in SOL per BONK
  } catch (error) {
    console.error(`Bot1: Price error for ${token.name}:`, error);
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

    // Fetch pool keys for the swap
    const poolKeys = await Liquidity.fetchInfo({
      connection,
      poolId: token.poolId,
      programId: MAINNET_PROGRAM_ID.AmmV4,
    });

    const swapTx = await Liquidity.makeSwapInstructionSimple({
      connection,
      poolKeys,
      userKeys: { tokenAccount, owner: wallet.publicKey },
      amountIn: amount * 10 ** 9, // SOL lamports
      amountOut: 0,
      inputTokenMint: new PublicKey("So11111111111111111111111111111111111111112"), // SOL
      programId: MAINNET_PROGRAM_ID.AmmV4,
    });

    const txId = await connection.sendTransaction(swapTx.transaction, [wallet]);
    console.log(`Bot1: Bought ${token.name} for ${amount} SOL. Tx: ${txId}`);
  } catch (error) {
    console.error(`Bot1: Buy error for ${token.name}:`, error);
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
    console.log(`Bot1: Sold ${token.name}. Tx: ${txId}`);
  } catch (error) {
    console.error(`Bot1: Sell error for ${token.name}:`, error);
  }
}

async function trade() {
  console.log("Bot1: Starting scalping bot for BONK/SOL...");
  while (true) {
    for (const token of TOKENS) {
      const currentPrice = await fetchTokenPrice(token);
      if (!currentPrice) continue;

      if (!lastPrices.has(token.name)) {
        lastPrices.set(token.name, currentPrice);
        console.log(`Bot1: ${token.name} initial price: ${currentPrice} SOL`);
        continue;
      }

      const lastPrice = lastPrices.get(token.name);
      const balance = await connection.getBalance(wallet.publicKey) / 10 ** 9;

      if (currentPrice <= lastPrice * BUY_THRESHOLD && balance >= BUDGET_PER_TOKEN) {
        console.log(`Bot1: ${token.name} dipped to ${currentPrice} SOL, buying...`);
        await buyToken(token, BUDGET_PER_TOKEN);
      } else if (currentPrice >= lastPrice * SELL_THRESHOLD) {
        console.log(`Bot1: ${token.name} rose to ${currentPrice} SOL, selling...`);
        await sellToken(token);
      } else {
        console.log(`Bot1: ${token.name} price: ${currentPrice} SOL, no action.`);
      }

      lastPrices.set(token.name, currentPrice);
    }
    await new Promise((resolve) => setTimeout(resolve, PRICE_CHECK_INTERVAL));
  }
}

trade().catch((error) => console.error("Bot1: Bot error:", error));