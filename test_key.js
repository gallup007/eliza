import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

try {
  const decoded = bs58.decode(process.env.PRIVATE_KEY_BOT1);
  console.log("Private key decoded successfully:", decoded);
} catch (error) {
  console.error("Error decoding private key:", error);
}
