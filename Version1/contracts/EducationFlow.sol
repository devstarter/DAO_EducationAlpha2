// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";


interface IERC20 {
    function transferFrom(address from,address to, uint amount) external;
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint amount) external;
    function decimals() external view returns (uint8);
    function approve(address spender, uint amount) external;
    function allowance(address owner, address spender) external view returns(uint256);

}

contract EducationPlatform is Ownable {

    using Counters for Counters.Counter;
    Counters.Counter private _expertId;
    Counters.Counter private _currentRound;
    enum courseStatus { Pending, Done, Canceled }
    
    IERC20 USDT;


    struct Round {
        uint endtime;
        uint startTime;
        uint budget;
        uint totalVotes;
        mapping(uint => ExpertRoundInfo) expertsInfoByRound;
    }

    struct Expert { //this is Expert
        address expertAddress;
        uint expertId;
        uint voices;
        uint usdtBalance;
    }

    struct ExpertRoundInfo {
        courseStatus status;
        uint votes;
        uint usdtDonated;
    }

    struct RegistrationRequest { //Special for experts(registration Form)
        address userAddress;
        string name;
        bool isActive;
    }

    struct VotingInfo{
        bool isVoted;
        uint usdtDonated;
    }

    mapping (uint => Round) public roundById;
    mapping (uint => Expert) public expertById;
    mapping (address => bool) public isRegistered;
    mapping (address => mapping(uint => VotingInfo)) public userVotingInfo;
    mapping (address => RegistrationRequest) public registrationRequests;
    
    constructor(address _USDT) {
        USDT = IERC20(_USDT);
    }

    function registerAsExpert(string memory _name) public {
        address _expertAddr = _msgSender();

        require(!isRegistered[_msgSender()], "You already registered");
        require(!registrationRequests[_expertAddr].isActive, 'You request already active');

        registrationRequests[_expertAddr].name = _name;
        registrationRequests[_expertAddr].userAddress = _expertAddr;
        registrationRequests[_expertAddr].isActive = true;
        //emit event of registering
    }


    function approveExpert(address _expertAddr) public onlyOwner {
        require(!isRegistered[_expertAddr], "This Expert already registered");
        require(registrationRequests[_expertAddr].isActive, "This request not active or not exist");
        
        isRegistered[_expertAddr] = true;
        registrationRequests[_expertAddr].isActive = false;

        expertById[_expertId.current()].expertAddress = _expertAddr;
        expertById[_expertId.current()].expertId = _expertId.current();
        _expertId.increment();
        //emit event
    }



    function startRound(uint _timeInDays, uint _roundBudgetUSDT) public onlyOwner {
        require(roundById[_currentRound.current()].endtime < block.timestamp, "round already active");
        require(USDT.allowance(_msgSender(), address(this)) >= _roundBudgetUSDT, "You need to approve mote USDT to start round with that budget");
        
        _currentRound.increment();
        
        uint _dayInSec = 1000*60*60*24;
        uint _endTime = block.timestamp + _timeInDays * _dayInSec;
        
        USDT.transferFrom(_msgSender(), address(this), _roundBudgetUSDT);
        roundById[_currentRound.current()].budget = _roundBudgetUSDT;

        roundById[_currentRound.current()].startTime = block.timestamp;
        roundById[_currentRound.current()].endtime = _endTime;
        //emit event about start round
    }


    function donateInUSDT(uint expertId, uint _amount) public{
        require(USDT.allowance(_msgSender(), address(this)) >= _amount, "You need to approve mote USDT to donate this");
        require(expertById[expertId].expertAddress != address(0), "Expert not exist");
        
        USDT.transferFrom(_msgSender(), address(this), _amount);
        
        if(
            !userVotingInfo[_msgSender()][expertId].isVoted 
            && roundById[_currentRound.current()].endtime > block.timestamp )
        {
            roundById[_currentRound.current()].totalVotes += 1;
            roundById[_currentRound.current()].expertsInfoByRound[expertId].votes +=1;
        }
        
        userVotingInfo[_msgSender()][expertId].isVoted = true;
        userVotingInfo[_msgSender()][expertId].usdtDonated += _amount;
        
        roundById[_currentRound.current()].expertsInfoByRound[expertId].usdtDonated += _amount;
        expertById[expertId].usdtBalance += _amount;
    }



    function transferTokensToExpert(uint expertId, uint _roundId) public onlyOwner{
        require(roundById[_currentRound.current()].expertsInfoByRound[expertId].status == courseStatus.Pending);
        roundById[_currentRound.current()].expertsInfoByRound[expertId].status = courseStatus.Done;
        uint donations = roundById[_currentRound.current()].expertsInfoByRound[expertId].usdtDonated;
        uint votes = roundById[_currentRound.current()].expertsInfoByRound[expertId].votes;
        USDT.transfer(expertById[expertId].expertAddress, donations + roundById[_roundId].budget*votes/roundById[_currentRound.current()].totalVotes);
    }
    function OnMoneyBack(uint expertId, uint _roundId) public onlyOwner{
        require(roundById[_roundId].expertsInfoByRound[expertId].status == courseStatus.Pending);
        roundById[_currentRound.current()].expertsInfoByRound[expertId].status = courseStatus.Canceled;
    }

    function getMoneyBack(uint expertId, uint _roundId) public {
        require(roundById[_roundId].expertsInfoByRound[expertId].status == courseStatus.Canceled, 'you cant get your money back now');
        require(userVotingInfo[_msgSender()][expertId].usdtDonated > 0,'you not donated for this expert');
        USDT.transfer(_msgSender(), userVotingInfo[_msgSender()][expertId].usdtDonated);
    }
    

    function getExpertsInfoById(uint id) public view returns( uint ) {
        return(roundById[_currentRound.current()].expertsInfoByRound[id].usdtDonated);
    }

    function getExpertsCourseStatusInfoById(uint id) public view returns( courseStatus ) {
        return(roundById[_currentRound.current()].expertsInfoByRound[id].status);
    }


}




