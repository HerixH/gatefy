const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const GatefyPOAP = await hre.ethers.getContractFactory("GatefyPOAP");
    const poap = await GatefyPOAP.deploy(
        "Gatefy POAP",
        "GAPOAP",
        "Gatefy Launch Event",
        "ipfs://QmExampleMetadataHash"
    );

    await poap.waitForDeployment();

    console.log("GatefyPOAP deployed to:", await poap.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
