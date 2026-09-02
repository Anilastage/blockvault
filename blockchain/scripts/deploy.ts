import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

interface DeploymentInfo {
  network: string;
  chainId: number;
  contractAddress: string;
  deployer: string;
  transactionHash: string;
  deployedAt: string;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Deploying DocumentVerification to network: ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer account: ${deployer.address}`);

  const factory = await ethers.getContractFactory('DocumentVerification');
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\nDocumentVerification deployed at: ${address}`);

  const info: DeploymentInfo = {
    network: network.name === 'unknown' ? `chain-${network.chainId}` : network.name,
    chainId: Number(network.chainId),
    contractAddress: address,
    deployer: deployer.address,
    transactionHash: contract.deploymentTransaction()?.hash ?? '',
    deployedAt: new Date().toISOString(),
  };

  // Persist deployment details so the backend/frontend can be configured.
  const outPath = path.resolve(__dirname, '..', 'deployment.json');
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
  console.log(`Deployment info saved to ${outPath}`);
  console.log('\nNext steps:');
  console.log(`1. Set CONTRACT_ADDRESS=${address} in backend/.env`);
  console.log(`2. Set CHAIN_ID=${info.chainId} in backend/.env`);
  console.log(
    `3. If using MetaMask with this network, make sure its RPC/chainId match (local hardhat: http://127.0.0.1:8545, id 31337).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
