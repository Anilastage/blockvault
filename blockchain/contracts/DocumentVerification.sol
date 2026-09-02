// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DocumentVerification
 * @notice Stores SHA-256 document hashes on-chain so anyone can later prove a
 *         document is authentic and unmodified. Only the cryptographic hash,
 *         owner address and registration timestamp are stored — never the
 *         document itself.
 *
 * Flow:
 *   1. Client computes keccak256(abi.encodePacked(sha256(file bytes)))? No —
 *      the raw 32-byte SHA-256 digest is passed directly as `documentHash`.
 *   2. registerDocument() stores it permanently and emits an event.
 *   3. verifyDocument()/getDocument() allow anyone to check authenticity.
 */
contract DocumentVerification is Ownable {
    struct DocumentRecord {
        bool exists;
        address owner;
        uint64 timestamp; // registration time (sufficient until year 2541)
        uint256 blockNumber; // block in which registration happened
    }

    /// @dev document hash (SHA-256 digest as bytes32) => record
    mapping(bytes32 => DocumentRecord) private _documents;

    /// @notice Total number of unique documents registered
    uint256 public totalDocuments;

    event DocumentRegistered(
        bytes32 indexed documentHash,
        address indexed owner,
        uint256 timestamp
    );

    error EmptyHash();
    error AlreadyRegistered(bytes32 documentHash, address existingOwner);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Registers a document hash permanently on-chain.
     * @param documentHash The 32-byte SHA-256 digest of the document.
     * @custom:reverts EmptyHash if the provided hash is zero.
     * @custom:reverts AlreadyRegistered if this exact hash was registered before.
     */
    function registerDocument(bytes32 documentHash) external {
        if (documentHash == bytes32(0)) revert EmptyHash();

        DocumentRecord storage record = _documents[documentHash];
        if (record.exists) revert AlreadyRegistered(documentHash, record.owner);

        record.exists = true;
        record.owner = msg.sender;
        record.timestamp = uint64(block.timestamp);
        record.blockNumber = block.number;

        unchecked {
            totalDocuments += 1;
        }

        emit DocumentRegistered(documentHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Fetches the full on-chain record of a document hash.
     * @return exists True when the hash has been registered.
     * @return owner Wallet that originally registered the document.
     * @return timestamp Block timestamp of the registration transaction.
     * @return blockNumber Block number containing the registration transaction.
     */
    function getDocument(
        bytes32 documentHash
    )
        external
        view
        returns (bool exists, address owner, uint256 timestamp, uint256 blockNumber)
    {
        DocumentRecord storage record = _documents[documentHash];
        return (record.exists, record.owner, uint256(record.timestamp), record.blockNumber);
    }

    /**
     * @notice Gas-cheap existence check for quick verification flows.
     */
    function verifyDocument(bytes32 documentHash) external view returns (bool) {
        return _documents[documentHash].exists;
    }
}
