import { ethers } from "hardhat";

async function main() {
  const target = "0x39c4f439ea2cb2a19670365ea3530461c25736b8";
  const [signer] = await ethers.getSigners();

  const before = await ethers.provider.getBalance(target);
  console.log("Before:", ethers.formatEther(before), "ETH");

  const tx = await signer.sendTransaction({
    to: target,
    value: ethers.parseEther("100.0"),
  });
  await tx.wait();

  const after = await ethers.provider.getBalance(target);
  console.log("After:", ethers.formatEther(after), "ETH");
  console.log("Tx hash:", tx.hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
