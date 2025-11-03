// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PayrollEscrow is ReentrancyGuard, Ownable {
    IERC20 public immutable usdc;
    
    struct Stream {
        address employer;
        address employee;
        uint256 totalAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 withdrawnAmount;
        bool active;
        bool cancelled;
    }
    
    mapping(uint256 => Stream) public streams;
    mapping(address => uint256[]) public employerStreams;
    mapping(address => uint256[]) public employeeStreams;
    
    uint256 public streamCounter;
    
    event StreamCreated(
        uint256 indexed streamId,
        address indexed employer,
        address indexed employee,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime
    );
    
    event FundsDeposited(
        uint256 indexed streamId,
        address indexed employer,
        uint256 amount
    );
    
    event FundsWithdrawn(
        uint256 indexed streamId,
        address indexed employee,
        uint256 amount
    );
    
    event StreamCancelled(
        uint256 indexed streamId,
        address indexed employer
    );
    
    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }
    
    /**
     * @notice Creates a new pay stream
     * @param _employee Address of the employee receiving payments
     * @param _totalAmount Total USDC amount to stream
     * @param _duration Duration of the stream in seconds
     */
    function createStream(
        address _employee,
        uint256 _totalAmount,
        uint256 _duration
    ) external returns (uint256 streamId) {
        require(_employee != address(0), "Invalid employee address");
        require(_employee != msg.sender, "Cannot stream to self");
        require(_duration > 0, "Duration must be greater than 0");
        // Allow _totalAmount to be 0 if depositing separately
        
        streamId = streamCounter++;
        
        streams[streamId] = Stream({
            employer: msg.sender,
            employee: _employee,
            totalAmount: _totalAmount,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            withdrawnAmount: 0,
            active: true,
            cancelled: false
        });
        
        employerStreams[msg.sender].push(streamId);
        employeeStreams[_employee].push(streamId);
        
        emit StreamCreated(
            streamId,
            msg.sender,
            _employee,
            _totalAmount,
            block.timestamp,
            block.timestamp + _duration
        );
        
        return streamId;
    }
    
    /**
     * @notice Deposits USDC into escrow for a specific stream
     * @param _streamId The stream ID to fund
     * @param _amount Amount of USDC to deposit
     */
    function deposit(
        uint256 _streamId,
        uint256 _amount
    ) external nonReentrant {
        Stream storage stream = streams[_streamId];
        require(stream.employer == msg.sender, "Not the employer");
        require(stream.active && !stream.cancelled, "Stream inactive");
        require(_amount > 0, "Amount must be greater than 0");
        
        stream.totalAmount += _amount;
        
        require(
            usdc.transferFrom(msg.sender, address(this), _amount),
            "USDC transfer failed"
        );
        
        emit FundsDeposited(_streamId, msg.sender, _amount);
    }
    
    /**
     * @notice Calculates the vested amount for a stream
     * @param _streamId The stream ID to check
     * @return vested The amount available to withdraw
     */
    function calculateVested(
        uint256 _streamId
    ) public view returns (uint256 vested) {
        Stream memory stream = streams[_streamId];
        
        if (!stream.active || stream.cancelled) {
            return 0;
        }
        
        if (block.timestamp < stream.startTime) {
            return 0;
        }
        
        if (block.timestamp >= stream.endTime) {
            vested = stream.totalAmount;
        } else {
            uint256 elapsed = block.timestamp - stream.startTime;
            uint256 duration = stream.endTime - stream.startTime;
            vested = (stream.totalAmount * elapsed) / duration;
        }
        
        if (vested > stream.totalAmount) {
            vested = stream.totalAmount;
        }
        
        return vested - stream.withdrawnAmount;
    }
    
    /**
     * @notice Withdraws available vested funds from a stream
     * @param _streamId The stream ID to withdraw from
     */
    function withdraw(uint256 _streamId) external nonReentrant {
        Stream storage stream = streams[_streamId];
        require(stream.employee == msg.sender, "Not the employee");
        require(stream.active && !stream.cancelled, "Stream inactive");
        
        uint256 vested = calculateVested(_streamId);
        require(vested > 0, "No funds available");
        
        stream.withdrawnAmount += vested;
        
        require(
            usdc.transfer(msg.sender, vested),
            "USDC transfer failed"
        );
        
        emit FundsWithdrawn(_streamId, msg.sender, vested);
    }
    
    /**
     * @notice Cancels a stream and refunds remaining balance to employer
     * @param _streamId The stream ID to cancel
     */
    function cancelStream(uint256 _streamId) external nonReentrant {
        Stream storage stream = streams[_streamId];
        require(stream.employer == msg.sender, "Not the employer");
        require(stream.active && !stream.cancelled, "Stream cancelled or inactive");
        
        // Calculate vested amount BEFORE marking as cancelled
        uint256 vested = calculateVested(_streamId);
        uint256 totalWithdrawn = stream.withdrawnAmount;
        uint256 remaining = stream.totalAmount - totalWithdrawn;
        
        stream.cancelled = true;
        stream.active = false;
        
        // Transfer vested amount to employee if any is available
        if (vested > 0 && vested <= remaining) {
            stream.withdrawnAmount += vested;
            require(
                usdc.transfer(stream.employee, vested),
                "USDC transfer failed"
            );
            emit FundsWithdrawn(_streamId, stream.employee, vested);
        }
        
        // Refund unvested portion to employer
        uint256 unvested = remaining - vested;
        if (unvested > 0) {
            require(
                usdc.transfer(stream.employer, unvested),
                "USDC transfer failed"
            );
        }
        
        emit StreamCancelled(_streamId, msg.sender);
    }
    
    /**
     * @notice Gets all stream IDs for an employer
     */
    function getEmployerStreams(
        address _employer
    ) external view returns (uint256[] memory) {
        return employerStreams[_employer];
    }
    
    /**
     * @notice Gets all stream IDs for an employee
     */
    function getEmployeeStreams(
        address _employee
    ) external view returns (uint256[] memory) {
        return employeeStreams[_employee];
    }
    
    /**
     * @notice Gets stream details
     */
    function getStream(
        uint256 _streamId
    ) external view returns (Stream memory) {
        return streams[_streamId];
    }
}