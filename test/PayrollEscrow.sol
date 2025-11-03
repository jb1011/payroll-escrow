// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/PayrollEscrow.sol";

// Mock USDC contract
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PayrollEscrowTest is Test {
    PayrollEscrow payroll;
    MockUSDC usdc;
    
    address employer = address(0x1);
    address employee = address(0x2);
    
    function setUp() public {
        usdc = new MockUSDC();
        payroll = new PayrollEscrow(address(usdc));
        
        // Mint USDC to employer
        usdc.mint(employer, 10000e6); // 10k USDC (6 decimals)
    }
    
    function testCreateStream() public {
        vm.startPrank(employer);
        uint256 streamId = payroll.createStream(employee, 1000e6, 30 days);
        vm.stopPrank();
        
        PayrollEscrow.Stream memory stream = payroll.getStream(streamId);
        assertEq(stream.employer, employer);
        assertEq(stream.employee, employee);
        assertEq(stream.totalAmount, 1000e6);
        assertTrue(stream.active);
    }
    
    function testDeposit() public {
        vm.startPrank(employer);
        uint256 streamId = payroll.createStream(employee, 1000e6, 30 days);
        usdc.approve(address(payroll), 1000e6);
        payroll.deposit(streamId, 1000e6);
        vm.stopPrank();
        
        assertEq(usdc.balanceOf(address(payroll)), 1000e6);
    }
    
    function testWithdrawAfterHalfTime() public {
        vm.startPrank(employer);
        // Create stream with 0 amount, then deposit separately
        uint256 streamId = payroll.createStream(employee, 0, 30 days);
        usdc.approve(address(payroll), 1000e6);
        payroll.deposit(streamId, 1000e6);
        vm.stopPrank();
        
        // Fast forward 15 days (half of 30 days)
        vm.warp(block.timestamp + 15 days);
        
        vm.prank(employee);
        payroll.withdraw(streamId);
        
        // Should have withdrawn approximately 50% of 1000e6 = 500e6
        assertApproxEqRel(usdc.balanceOf(employee), 500e6, 0.01e18); // 1% tolerance
    }
    
    function testCancelStream() public {
        vm.startPrank(employer);
        uint256 employerInitialBalance = usdc.balanceOf(employer);
        // Create stream with 0 amount, then deposit separately
        uint256 streamId = payroll.createStream(employee, 0, 30 days);
        usdc.approve(address(payroll), 1000e6);
        payroll.deposit(streamId, 1000e6);
        vm.stopPrank();
        
        // Fast forward 10 days (1/3 of 30 days, so ~1/3 should be vested)
        vm.warp(block.timestamp + 10 days);
        
        uint256 vested = payroll.calculateVested(streamId);
        // Approximately 333e6 should be vested (1/3 of 1000e6)
        assertApproxEqRel(vested, 333e6, 0.1e18); // 10% tolerance
        
        uint256 employeeInitialBalance = usdc.balanceOf(employee);
        
        vm.startPrank(employer);
        payroll.cancelStream(streamId);
        vm.stopPrank();
        
        // Employee should receive vested portion (~333e6)
        uint256 employeeReceived = usdc.balanceOf(employee) - employeeInitialBalance;
        assertApproxEqRel(employeeReceived, 333e6, 0.1e18); // 10% tolerance
        
        // Employer should receive unvested portion (approx 667e6)
        // Initial balance was 10000e6, deposited 1000e6, so now should have ~9667e6
        uint256 employerFinalBalance = usdc.balanceOf(employer);
        uint256 employerRefund = employerFinalBalance - (employerInitialBalance - 1000e6);
        assertApproxEqRel(employerRefund, 667e6, 0.1e18); // 10% tolerance
    }
}