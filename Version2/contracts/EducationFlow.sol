// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

//  Interface for ERC20 stablecoins as USDT, DAI, BUSD etc.
//  In this version i used only USDT for payments. In next versions it will be possible to
//  pay by various tokens.
interface IERC20 {                                                                              
    function transferFrom(address from,address to, uint amount) external;                       
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint amount) external;
    function decimals() external view returns (uint8);
    function approve(address spender, uint amount) external;
    function allowance(address owner, address spender) external view returns(uint256);
}

// Start of the smart contract for DAO education platform
// This version supprots only one round of quadraticFounring
contract EducationPlatform is Ownable {

    using Counters for Counters.Counter;
    

    // Here you can see main data strucure of round system
    // enums using for emit events and later using them onback-end
    Counters.Counter private _expertId;
    enum Register { None, Pending, Done }
    enum CourseStatus {Pending, Done, Canceled}
    IERC20 USDT;
    Round public round;
    //address withdrawAddr;

    mapping (uint => Expert) public expertById;
    mapping (address => bool) public isRegistered;
    mapping (address => mapping (uint => DonatingInfo)) public userDonation;
    mapping (address => RegistrationRequest) public registrationRequests;
    
    // Data about our experts like ADDRESS, NAME, BALANCE and VOTES for this expert

    struct Expert { //this is Expert
        address expertAddress;
        string expertName;
        uint expertId;
        uint votes;
        uint balance;
        CourseStatus status;
    }

    // Donating info using in mapping, to know is user donated for current expert
    // and how much
    struct DonatingInfo{
        bool isDonated;
        uint amountOfDonations;
    }

    // RegistrationRequest also using in mapping and used for register our experts in system
    struct RegistrationRequest { 
        address userAddress;
        string name;
        Register registrationStatus;
    }

    // Info about round
    struct Round{
        uint budget;
        uint startTime;
        uint endTime;
        uint totalVotes;
        bool roundActive;
        mapping(address => mapping (uint => bool)) isUserDonatedToExpertInRound;
    }
    
    
    constructor(address _USDT) {
        USDT = IERC20(_USDT);
    }

    // Here function get string "Name of Expert" and scan its addres, then make request to register
    // after some requrements checks 
    function registerAsExpert(string memory _name) public {
        address _expertAddr = _msgSender();

        require(!isRegistered[_msgSender()], "You already registered");
        require(registrationRequests[_expertAddr].registrationStatus == Register.None, 'Your request already created');

        registrationRequests[_expertAddr].name = _name;
        registrationRequests[_expertAddr].userAddress = _expertAddr;
        registrationRequests[_expertAddr].registrationStatus = Register.Pending;
        //emit event of registering
    }

    // Deployer of smart-contract can approve any of the users request and register him as Expert
    function approveExpert(address _expertAddr) public onlyOwner {
        require(!isRegistered[_expertAddr], "This Expert already registered");
        require(registrationRequests[_expertAddr].registrationStatus != Register.None, "This request not exist");
        
        uint expertId = _expertId.current();
        
        isRegistered[_expertAddr] = true;
        registrationRequests[_expertAddr].registrationStatus = Register.Done;

        expertById[expertId].expertAddress = _expertAddr;
        expertById[expertId].expertId = expertId;
        expertById[expertId].expertName = registrationRequests[_expertAddr].name;
        _expertId.increment();
        //emit event
    }

    // After all experts registration, contract Owner should to start round by giving function latency in days
    function startRound(uint _timeInDays, uint _roundBudgetUSDT) public onlyOwner {
        require(!round.roundActive, "Round already active");
        require(USDT.balanceOf(_msgSender()) >= _roundBudgetUSDT, "You havent enougth USDT");
        require(USDT.allowance(_msgSender(), address(this)) >= _roundBudgetUSDT, "You need to approve mote USDT to start round with that budget");
        
        uint _dayInSec = 1000*60*60*24;
        uint _endTime = block.timestamp + _timeInDays * _dayInSec;
        
        round.roundActive = true;
        round.endTime = _endTime;
        round.budget = _roundBudgetUSDT;
        round.startTime = block.timestamp;
        USDT.transferFrom(_msgSender(), address(this), _roundBudgetUSDT);
    }

    // Native users allow to donate any existing expert some funds
    // in USDT, then some votes adding for expert in this round if he 
    // not voted for this expert in this round yet
    function donateInUSDT(uint _id, uint _amount) public{
        require(USDT.balanceOf(_msgSender()) >= _amount, "You havent enougth USDT");
        require(USDT.allowance(_msgSender(), address(this)) >= _amount, "You need to approve mote USDT to donate this");
        require(expertById[_id].expertAddress != address(0), "Expert not exist");
        
        USDT.transferFrom(_msgSender(), address(this), _amount);
        if(round.startTime < block.timestamp && block.timestamp < round.endTime && !round.isUserDonatedToExpertInRound[_msgSender()][_id]){
            round.totalVotes++;
            expertById[_id].votes++;
            round.isUserDonatedToExpertInRound[_msgSender()][_id] = true;
        }
        expertById[_id].balance+= _amount;
        userDonation[_msgSender()][_id].isDonated = true;
        userDonation[_msgSender()][_id].amountOfDonations+= _amount;
    }


    // After round ending and expert produced his course, 
    // contract Owner can approve that and transfer his donation and
    // funding revard to experts wallet
    function transferTokensToExpert(uint _id) public onlyOwner{
        //require(round.endTime < block.timestamp, "Round not finished yet");
        require(expertById[_id].expertAddress != address(0), "Expert not exist");
        require(expertById[_id].status == CourseStatus.Pending, "This is already not actual");
        expertById[_id].status = CourseStatus.Done;
        uint balance = expertById[_id].balance;
        uint revard = round.budget * expertById[_id].votes / round.totalVotes;
        expertById[_id].balance = 0;
        USDT.transfer(expertById[_id].expertAddress, balance+revard);
    }

    function OnMoneyBack(uint _id) public onlyOwner{
        //require(round.endTime < block.timestamp, "Round not finished yet");
        require(expertById[_id].expertAddress != address(0), "Expert not exist");
        require(expertById[_id].status == CourseStatus.Pending, "This is already not actual");
        expertById[_id].status = CourseStatus.Canceled;
    }

    function getMoneyBack(uint _id) public {
        //require(round.endTime < block.timestamp, "Round not finished yet");
        require(expertById[_id].expertAddress != address(0), "Expert not exist");
        require(expertById[_id].status == CourseStatus.Canceled, "This course not canceled");
        uint donated = userDonation[_msgSender()][_id].amountOfDonations;
        require(0 < userDonation[_msgSender()][_id].amountOfDonations, "Nothing to withdraw");
        userDonation[_msgSender()][_id].amountOfDonations = 0;
        expertById[_id].balance -= donated;
        USDT.transfer(_msgSender(), donated);
    }
}




