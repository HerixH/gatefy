require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // fallback .env
require('@nomicfoundation/hardhat-ethers');

const deployerKey = (process.env.PRIVATE_KEY || process.env.BASE_MINTER_PRIVATE_KEY || '').trim();
const accounts =
    deployerKey && deployerKey !== 'DEV' && /^0x[a-fA-F0-9]{64}$/.test(deployerKey)
        ? [deployerKey]
        : deployerKey && deployerKey !== 'DEV' && /^[a-fA-F0-9]{64}$/.test(deployerKey)
          ? [`0x${deployerKey}`]
          : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: '0.8.20',
    networks: {
        baseSepolia: {
            url: process.env.BASE_RPC_URL || 'https://sepolia.base.org',
            accounts,
        },
        base: {
            url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
            accounts,
        },
    },
};
