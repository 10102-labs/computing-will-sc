import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const contract = await ethers.deployContract("ForwardingEOAWillRouter");
  console.log("Start deploying ForwardingEOAWillRouter...");
  await contract.waitForDeployment();
  console.log("ForwardingEOAWillRouter deployed to:", contract.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
