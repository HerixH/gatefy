// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GatefyPOAP is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;
    
    mapping(address => bool) public hasClaimed;
    
    string public eventName;
    uint256 public eventDate;
    string public baseTokenURI;
    
    bool public mintingEnabled = true;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _eventName,
        string memory _baseURI
    ) ERC721(_name, _symbol) Ownable(msg.sender) {
        eventName = _eventName;
        eventDate = block.timestamp;
        baseTokenURI = _baseURI;
    }

    function setMintingEnabled(bool _enabled) public onlyOwner {
        mintingEnabled = _enabled;
    }

    function mintPOAP() public {
        require(mintingEnabled, "Minting is currently disabled");
        require(!hasClaimed[msg.sender], "You have already claimed your POAP");
        
        uint256 tokenId = _nextTokenId++;
        hasClaimed[msg.sender] = true;
        
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, baseTokenURI);
    }

    // Required overrides
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
