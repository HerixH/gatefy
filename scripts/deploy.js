const hre = require('hardhat');

async function main() {
    const signers = await hre.ethers.getSigners();
    if (!signers.length) {
        throw new Error(
            'No deployer key. In .env.local set BASE_MINTER_PRIVATE_KEY=0x… (64 hex chars, funded on Base Sepolia), then rerun.'
        );
    }

    const [deployer] = signers;
    console.log('Network:', hre.network.name);
    console.log('Deploying GatefyPOAP with:', deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log('Balance:', hre.ethers.formatEther(balance), 'ETH');
    if (balance === 0n) {
        throw new Error(
            'Deployer has 0 ETH. Fund this address on Base Sepolia (faucet), then retry.'
        );
    }

    const baseURI = process.env.POAP_BASE_URI || 'https://www.gateprotocol.xyz/api/poap/';
    const GatefyPOAP = await hre.ethers.getContractFactory('GatefyPOAP');
    const poap = await GatefyPOAP.deploy('Gate Protocol Attendance', 'GATE', baseURI);
    await poap.waitForDeployment();

    const address = await poap.getAddress();
    console.log('');
    console.log('GatefyPOAP deployed to:', address);
    console.log('Minter (deployer):', deployer.address);
    console.log('');
    console.log('Put these in .env.local (and Vercel Production):');
    console.log('  BASE_POAP_CONTRACT_ID=' + address);
    console.log('  BASE_MINTER_PRIVATE_KEY=<same key you used to deploy>');
    console.log('  ATTENDANCE_MINT_CHAIN=both');
    console.log('  NEXT_PUBLIC_BASE_CHAIN=baseSepolia');
    console.log('  NEXT_PUBLIC_DEV_MODE=false   # for real mints in production');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
