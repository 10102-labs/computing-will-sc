import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const contract = await ethers.deployContract("InheritanceWillRouter");
  console.log("Start deploying InheritanceWillRouter...");
  await contract.waitForDeployment();
  console.log("InheritanceWillRouter deployed to:", contract.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
