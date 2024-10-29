import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const contract = await ethers.deployContract("ForwardingWillRouter");
  console.log("Start deploying ForwardingWillRouter...");
  await contract.waitForDeployment();
  console.log("ForwardingWillRouter deployed to:", contract.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
