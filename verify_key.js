import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

try {
  const decoded = bs58.decode(process.env.PRIVATE_KEY_BOT1);
  console.log("Decoded key length:", decoded.length);

  // Accept both 32-byte and 64-byte keys
  if (decoded.length !== 32 && decoded.length !== 64) {
    throw new Error("Expected 32 or 64-byte secret key, got " + decoded.length + " bytes");
  }

  const keypair = Keypair.fromSecretKey(decoded);
  const publicKey = keypair.publicKey.toString();

  console.log("✅ Derived Public Key:", publicKey);
} catch (error) {
  console.error("❌ Error verifying key:", error);
}

