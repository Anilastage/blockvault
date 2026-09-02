import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

// Test-only helper: registers an arbitrary SHA-256 hash on the deployed
// local contract so we can manually exercise verification flows.
async function main() {
  const [signer] = await ethers.getSigners();
  const dep = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'deployment.json'), 'utf8')
  );
  const contract = await ethers.getContractAt('DocumentVerification', dep.contractAddress, signer);

  const hashes = (process.env.HASHES ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter((h) => /^[a-fA-F0-9]{64}$/.test(h));

  if (!hashes.length) {
    console.error('Provide HASHES=sha256,... env var');
    process.exitCode = 1;
    return;
  }

  for (const h of hashes) {
    const bytes32 = '0x' + h.toLowerCase();
    const existing = await contract.getDocument(bytes32);
    if (existing.exists) {
      console.log(`Already registered: ${h} (owner ${existing.owner})`);
      continue;
    }
    const tx = await contract.registerDocument(bytes32);
    await tx.wait();
    console.log(`Registered ${h} from ${signer.address} in tx ${tx.hash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
