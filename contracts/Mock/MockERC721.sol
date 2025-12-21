// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    uint256 public nextTokenId = 1;

    constructor() ERC721("Test NFT", "TNFT") {}

    function mint(address to) public returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);
        return tokenId;
    }
}
