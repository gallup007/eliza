import bs58 from "bs58";
import dotenv from "dotenv";
import { Keypair } from "@solana/web3.js";

dotenv.config();

try {
  const combinedKey = bs58.decode(process.env.PRIVATE_KEY_BOT1);
  console.log("Decoded combined key length:", combinedKey.length);
  if (combinedKey.length !== 64) {
    throw new Error("Expected 64-byte combined key, got " + combinedKey.length + " bytes");
  }

  // Extract the first 32 bytes (secret key)
  const secretKey = combinedKey.slice(0, 32);
  console.log("Extracted secret key length:", secretKey.length);
  console.log("Extracted secret key bytes:", secretKey);

  // Encode the secret key in base58
  const secretKeyBase58 = bs58.encode(secretKey);
  console.log("Extracted Secret Key (base58):", secretKeyBase58);

  // Generate keypair to verify the public key
  const keypair = Keypair.fromSecretKey(secretKey);
  console.log("Derived Public Key:", keypair.publicKey.toString());
} catch (error) {
  console.error("Error extracting secret key:", error);
}
