// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimal ERC20 interface for atomic token transfers (USDC on Base L2)
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title CrossRailHTLC
 * @notice Cross-Rail Hashed Timelock Contract (HTLC) for Base L2 <-> Bitcoin Lightning Atomic Swaps
 * @dev Uses EVM native SHA-256 precompile (0x02) to match Lightning Network BOLT-11 preimage verification.
 */
contract CrossRailHTLC {
    enum SwapState {
        EMPTY,
        ACTIVE,
        REDEEMED,
        REFUNDED
    }

    struct Swap {
        bytes32 hashlock;       // SHA-256 hash of the 32-byte preimage (Lightning payment hash)
        bytes32 preimage;       // Revealed 32-byte secret preimage upon redemption
        uint256 timelock;       // Unix timestamp after which initiator can refund
        uint256 amount;         // Amount of tokens (e.g. USDC 6 decimals)
        address initiator;      // Maker / funder who locks the tokens
        address recipient;      // Claimer who can redeem by revealing the preimage
        address tokenContract;  // Address of ERC20 token (e.g. USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
        SwapState state;        // Current state of the swap
    }

    mapping(bytes32 => Swap) public swaps;

    event SwapCreated(
        bytes32 indexed swapId,
        bytes32 indexed hashlock,
        address indexed initiator,
        address recipient,
        address tokenContract,
        uint256 amount,
        uint256 timelock
    );

    event SwapRedeemed(
        bytes32 indexed swapId,
        bytes32 indexed hashlock,
        bytes32 preimage,
        address indexed recipient
    );

    event SwapRefunded(
        bytes32 indexed swapId,
        bytes32 indexed hashlock,
        address indexed initiator
    );

    /**
     * @notice Locks tokens in HTLC waiting for preimage reveal
     * @param swapId Unique identifier for this swap
     * @param recipient Target recipient eligible to claim with preimage
     * @param tokenContract Address of the ERC20 token (USDC)
     * @param amount Token amount to lock
     * @param hashlock SHA-256 hash of the secret preimage
     * @param timelock Unix timestamp expiry after which initiator can refund
     */
    function createSwap(
        bytes32 swapId,
        address recipient,
        address tokenContract,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    ) external {
        require(swaps[swapId].state == SwapState.EMPTY, "Swap already exists");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(timelock > block.timestamp + 30 minutes, "Timelock too short (min 30m)");
        require(hashlock != bytes32(0), "Invalid hashlock");

        swaps[swapId] = Swap({
            hashlock: hashlock,
            preimage: bytes32(0),
            timelock: timelock,
            amount: amount,
            initiator: msg.sender,
            recipient: recipient,
            tokenContract: tokenContract,
            state: SwapState.ACTIVE
        });

        bool success = IERC20(tokenContract).transferFrom(msg.sender, address(this), amount);
        require(success, "Token transferFrom failed");

        emit SwapCreated(swapId, hashlock, msg.sender, recipient, tokenContract, amount, timelock);
    }

    /**
     * @notice Redeems locked tokens by revealing the SHA-256 preimage
     * @param swapId Unique identifier for the swap
     * @param preimage 32-byte secret preimage matching the hashlock
     */
    function redeem(bytes32 swapId, bytes32 preimage) external {
        Swap storage swap = swaps[swapId];

        require(swap.state == SwapState.ACTIVE, "Swap not active");
        require(block.timestamp <= swap.timelock, "Timelock expired");
        require(sha256(abi.encodePacked(preimage)) == swap.hashlock, "Invalid preimage (SHA-256 mismatch)");

        swap.preimage = preimage;
        swap.state = SwapState.REDEEMED;

        bool success = IERC20(swap.tokenContract).transfer(swap.recipient, swap.amount);
        require(success, "Token transfer failed");

        emit SwapRedeemed(swapId, swap.hashlock, preimage, swap.recipient);
    }

    /**
     * @notice Refunds locked tokens to the initiator after the timelock expires
     * @param swapId Unique identifier for the swap
     */
    function refund(bytes32 swapId) external {
        Swap storage swap = swaps[swapId];

        require(swap.state == SwapState.ACTIVE, "Swap not active");
        require(block.timestamp > swap.timelock, "Timelock not yet expired");

        swap.state = SwapState.REFUNDED;

        bool success = IERC20(swap.tokenContract).transfer(swap.initiator, swap.amount);
        require(success, "Token transfer failed");

        emit SwapRefunded(swapId, swap.hashlock, swap.initiator);
    }

    /**
     * @notice Convenience view to check swap status and details
     */
    function getSwap(bytes32 swapId) external view returns (Swap memory) {
        return swaps[swapId];
    }
}
