import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('DocumentVerification', function () {
  const ZERO_HASH = ethers.ZeroHash;
  const HASH_A = '0x' + 'a'.repeat(64);
  const HASH_B = '0x' + 'b'.repeat(64);

  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    const contract = await ethers.deployContract('DocumentVerification');
    return { contract, owner, user1, user2 };
  }

  describe('Registration', function () {
    it('registers a document hash and emits an event', async function () {
      const { contract, user1 } = await loadFixture(deployFixture);

      await expect(contract.connect(user1).registerDocument(HASH_A))
        .to.emit(contract, 'DocumentRegistered')
        .withArgs(HASH_A, user1.address, anyUint());

      const total = await contract.totalDocuments();
      expect(total).to.equal(1);
    });

    it('stores the correct owner, timestamp and block number', async function () {
      const { contract, user1 } = await loadFixture(deployFixture);
      const tx = await contract.connect(user1).registerDocument(HASH_A);
      const receipt = await tx.wait();

      const [exists, owner, timestamp, blockNumber] = await contract.getDocument(HASH_A);
      expect(exists).to.equal(true);
      expect(owner).to.equal(user1.address);
      expect(timestamp).to.be.gt(0);
      expect(blockNumber).to.equal(receipt!.blockNumber);
    });
  });

  describe('Retrieval & verification', function () {
    it('retrieves a registered document', async function () {
      const { contract, user1 } = await loadFixture(deployFixture);
      await contract.connect(user1).registerDocument(HASH_A);

      const record = await contract.getDocument(HASH_A);
      expect(record[0]).to.equal(true);
      expect(record[1]).to.equal(user1.address);
    });

    it('verifies an existing document', async function () {
      const { contract, user1 } = await loadFixture(deployFixture);
      await contract.connect(user1).registerDocument(HASH_A);
      expect(await contract.verifyDocument(HASH_A)).to.equal(true);
    });

    it('returns not-found for an unknown document', async function () {
      const { contract } = await loadFixture(deployFixture);
      const [exists] = await contract.getDocument(HASH_B);
      expect(exists).to.equal(false);
      expect(await contract.verifyDocument(HASH_B)).to.equal(false);
    });
  });

  describe('Duplicate handling', function () {
    it('rejects duplicate registration of the same hash', async function () {
      const { contract, user1, user2 } = await loadFixture(deployFixture);
      await contract.connect(user1).registerDocument(HASH_A);

      // Even a different wallet cannot re-register the same hash.
      await expect(
        contract.connect(user2).registerDocument(HASH_A)
      ).to.be.revertedWithCustomError(contract, 'AlreadyRegistered');
    });
  });

  describe('Invalid input / unauthorized actions', function () {
    it('rejects empty (zero) hashes', async function () {
      const { contract, user1 } = await loadFixture(deployFixture);
      await expect(
        contract.connect(user1).registerDocument(ZERO_HASH)
      ).to.be.revertedWithCustomError(contract, 'EmptyHash');
    });

    it('blocks non-owners from ownership transfer', async function () {
      const { contract, owner, user1 } = await loadFixture(deployFixture);
      await expect(
        contract.connect(user1).transferOwnership(user1.address)
      ).to.be.revertedWithCustomError(contract, 'OwnableUnauthorizedAccount');

      // Owner can still transfer.
      await expect(contract.connect(owner).transferOwnership(user1.address)).to.not.be.reverted;
    });

    it('does not allow anyone to alter or delete existing records', async function () {
      const { contract, user1 } = await loadFixture(deployFixture);
      await contract.connect(user1).registerDocument(HASH_A);

      // No mutation functions exist; the record must remain intact.
      const [, owner] = await contract.getDocument(HASH_A);
      expect(owner).to.equal(user1.address);
      expect(await contract.verifyDocument(HASH_A)).to.equal(true);
    });
  });
});

function anyUint() {
  return (value: unknown) => typeof value === 'bigint' && value >= 0n;
}
