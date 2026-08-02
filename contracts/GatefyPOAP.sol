// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Gate Protocol attendance proof on Base (ERC-721).
 * Server minter calls mintAttendance(to, eventId) after door verify — same role as Soroban mint.
 */

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GatefyPOAP is ERC721, Ownable {
    uint256 private _nextTokenId = 1;
    address public minter;
    string private _baseTokenURI;

    /// @dev attendee => keccak256(eventId) => minted
    mapping(address => mapping(bytes32 => bool)) public mintedForEvent;

    event AttendanceMinted(address indexed to, uint256 indexed tokenId, string eventId);

    constructor(string memory name_, string memory symbol_, string memory baseURI_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {
        minter = msg.sender;
        _baseTokenURI = baseURI_;
    }

    function setMinter(address minter_) external onlyOwner {
        require(minter_ != address(0), "zero minter");
        minter = minter_;
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    function mintAttendance(address to, string calldata eventId) external returns (uint256 tokenId) {
        require(msg.sender == minter || msg.sender == owner(), "not minter");
        require(to != address(0), "zero to");
        require(bytes(eventId).length > 0, "empty event");

        bytes32 key = keccak256(bytes(eventId));
        require(!mintedForEvent[to][key], "already minted for event");

        tokenId = _nextTokenId++;
        mintedForEvent[to][key] = true;
        _safeMint(to, tokenId);
        emit AttendanceMinted(to, tokenId, eventId);
    }

    function hasMinted(address attendee, string calldata eventId) external view returns (bool) {
        return mintedForEvent[attendee][keccak256(bytes(eventId))];
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
