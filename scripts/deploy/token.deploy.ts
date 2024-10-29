import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY as string);
  const numTokens = 6;
  for (let i = 3; i < numTokens; i++) {
    const contract = await ethers.deployContract("Token", [wallet.address, wallet.address, `TOKEN${i}`, `TK${i}`]);
    console.log(`Start deploying Token ${i}...`);
    await contract.waitForDeployment();
    console.log(`Token ${i} deployed to:`, contract.target);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
