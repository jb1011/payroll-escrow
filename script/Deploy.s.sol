// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import "../src/PayrollEscrow.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        
        console.log("Deploying PayrollEscrow...");
        console.log("USDC Address:", usdcAddress);
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        
        vm.startBroadcast(deployerPrivateKey);
        
        PayrollEscrow payroll = new PayrollEscrow(usdcAddress);
        
        console.log("PayrollEscrow deployed at:", address(payroll));
        console.log("Owner:", payroll.owner());
        
        vm.stopBroadcast();
    }
}

