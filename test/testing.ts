import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber} from "ethers";
import { Register, CourseStatus} from "./utils";
import { 
    MockUSDT, MockUSDT__factory,
    EducationPlatform, EducationPlatform__factory 
} from "../typechain-types";


describe("EDU Platform", async() => {
    
    let usdt: MockUSDT
    let edu : EducationPlatform
    let USDT: MockUSDT__factory
    let EDU : EducationPlatform__factory

    let user3: SignerWithAddress
    let user2: SignerWithAddress
    let user1: SignerWithAddress
    let expert: SignerWithAddress
    let expert2: SignerWithAddress
    let deployer: SignerWithAddress

    async function transferStartFunds() {

        let decimal = await usdt.decimals()
        let num: BigNumber;
        num = (BigNumber.from(10)).pow(decimal).mul(10)

        await usdt.transfer(user1.address, num)
        await usdt.transfer(expert.address, num)
        await usdt.transfer(expert2.address, num)
        await usdt.transfer(user3.address, num)
    }
    

    before(async()=>{

        [deployer, expert, expert2, user1, user2, user3] = await ethers.getSigners()
        USDT = await ethers.getContractFactory("MockUSDT")
        usdt = await USDT.deploy()
        EDU  = await ethers.getContractFactory("EducationPlatform")
        edu  = await EDU.deploy(usdt.address)

    })

    it("Should to deploy", async () => {

        expect(await usdt.totalSupply()).deep.equal("1000000000000000000000000") // total supply of USDT with 18 decimals
        expect(await edu.owner()).equal(deployer.address)
    })

    describe("Register Investor",async () => {

        it("[EXPERT] Should to add experts to register queue", async () => {
            await transferStartFunds()
            expect(await usdt.balanceOf(user1.address)).deep.equal('10000000000000000000')
            expect(await usdt.balanceOf(expert.address)).deep.equal('10000000000000000000')
    

            await edu.connect(expert).registerAsExpert("Donald Trump")
            expect((await edu.registrationRequests(expert.address)).registrationStatus).equal(Register.Pending)
            expect((await edu.registrationRequests(expert.address)).name).equal("Donald Trump")
            expect(((await edu.registrationRequests(expert.address)).userAddress)).equal(expert.address)

            await edu.connect(expert2).registerAsExpert("Barak Obama") // register expert2
            expect((await edu.registrationRequests(expert2.address)).registrationStatus).equal(Register.Pending)
            expect((await edu.registrationRequests(expert2.address)).name).equal("Barak Obama")
            expect(((await edu.registrationRequests(expert2.address)).userAddress)).equal(expert2.address)
        })
    
        it("[EXPERT] Should to revert if someone register twice", async () => {
            await expect(edu.connect(expert).registerAsExpert("same Donald Trump")).to.be.revertedWith('Your request already created')
            await expect(edu.connect(expert2).registerAsExpert("same Donald Trump")).to.be.revertedWith('Your request already created')
        })

        it("[DEPLOYER] Should accept registration", async () => {
            let Expert = expert.address
            let Expert2 = expert2.address

            expect((await edu.registrationRequests(Expert)).registrationStatus).equal(Register.Pending)
            expect((await edu.registrationRequests(Expert2)).registrationStatus).equal(Register.Pending)
            expect(await edu.isRegistered(Expert)).equal(false)
            expect(await edu.isRegistered(Expert2)).equal(false)
            
            await edu.approveExpert(Expert)
            await edu.approveExpert(Expert2)
            expect((await edu.registrationRequests(Expert)).registrationStatus).equal(Register.Done)
            expect((await edu.registrationRequests(Expert2)).registrationStatus).equal(Register.Done)
            expect(await edu.isRegistered(Expert)).equal(true)
            expect(await edu.isRegistered(Expert2)).equal(true)
            expect((await edu.expertById(0)).expertAddress).equal(Expert)
            expect((await edu.expertById(1)).expertAddress).equal(Expert2)

            await expect(edu.approveExpert(Expert)).to.be.revertedWith('This Expert already registered')
            await expect(edu.approveExpert(Expert2)).to.be.revertedWith('This Expert already registered')
        })

        it("[EXPERT] Should revert then try to register then registered", async() =>{
            await expect(edu.connect(expert).registerAsExpert("same Donald Trump")).to.be.revertedWith('You already registered')
            await expect(edu.connect(expert2).registerAsExpert("same Donald Trump")).to.be.revertedWith('You already registered')
        })
    })

    describe("Donating before round started", async () => {

        it("[USER] can donate while round not started",async()=>{
            let balance = await usdt.balanceOf(user3.address)
            await usdt.connect(user3).approve(edu.address, balance)
            await edu.connect(user3).donateInUSDT(0, balance)
            expect((await edu.round()).totalVotes).equal(0)
        })
    })

    describe("Starting round", async () => {

        it("[DEPLOYER] Should to start round", async() =>{
            let budget = ((BigNumber.from(10)).pow(18)).mul(100000000)
            await expect(edu.startRound(1, budget)).to.be.revertedWith('You havent enougth USDT')

            budget = ((BigNumber.from(10)).pow(18)).mul(10)
            await expect(edu.startRound(1, budget)).to.be.revertedWith('You need to approve mote USDT to start round with that budget')

            await usdt.approve(edu.address, budget)
            await edu.startRound(1, budget)
            
            expect((await edu.round()).roundActive).equal(true)
            expect((await edu.round()).budget).equal(budget)
        })

        it("[DEPLOYER] Should to revert if round started", async()=>{
            await expect(edu.startRound(1, 10000)).to.be.revertedWith('Round already active')
        })
    })

    describe("User votes", async () => {

        let donation = BigNumber.from(10).pow(18)

        it("[USER] Cant donate if not enouth USDT ", async ()=>{

            await expect(edu.connect(user1).donateInUSDT(0, donation.mul(1000))) //Checks that user cant donate more than he have
                .to.be.revertedWith('You havent enougth USDT')
        })
        it("[USER] Cant donate if not enouth allowance ", async ()=>{

            await expect(edu.connect(user1).donateInUSDT(0, donation))  //Checks that user need more allowance to pay
                .to.be.revertedWith('You need to approve mote USDT to donate this')
            await usdt.connect(user1).approve(edu.address, donation.mul(4))
        })

        it("[USER] Cant donate for no existing expert ", async ()=>{

            await expect(edu.connect(user1).donateInUSDT(10, donation)) //Checks that you cant donate to non exist user
            .to.be.revertedWith('Expert not exist')
        })
        
        it("[USER] Should able to vote correctly", async ()=>{

            let balance = (await edu.expertById(0)).balance
            expect((await edu.round()).totalVotes).equal(0) //Checks that total votes now is 0 

            await edu.connect(user1).donateInUSDT(0,donation)
            await edu.connect(user1).donateInUSDT(1,donation)

            expect((await edu.round()).totalVotes).equal(2) // We voted for 2 experts
            expect((await edu.expertById(0)).balance).equal(balance.add(donation))   //Checks that donations added to expert
   
            await edu.connect(user1).donateInUSDT(0,donation) 
            expect((await edu.round()).totalVotes).equal(2)     //Checks if user donates twice, its not adding to the votes
            expect((await edu.expertById(0)).balance).equal(balance.add(donation.mul(2)))
            expect((await edu.expertById(1)).balance).equal(donation)
        })
    })

    describe("Transfer funds for expert",async () => {

        it("[DEPLOYER] Cant transfer for non existing expert", async () => {
            await expect( edu.transferTokensToExpert(10)).to.be.revertedWith('Expert not exist')
        })

        it("[DEPLOYER] Should transfer funds for expert", async () => {
            
            let budget = (await edu.round()).budget
            let donations = (await edu.expertById(0)).balance
            let startBalance = await usdt.balanceOf(expert.address)
            let revard = ((await edu.round()).budget).div(2)
            await edu.transferTokensToExpert(0)
            expect((await edu.expertById(0)).status).equal(CourseStatus.Done)
            await expect(edu.transferTokensToExpert(0)).to.be.revertedWith('This is already not actual')
            expect((await usdt.balanceOf(expert.address)).sub(startBalance))
                .equal(donations.add(revard)) // shold to correctly transfer funds to expert
        })

        it("[DEPLOYER] Cant transfer for expert if course Status DONE or CANCELED", async () => {
            await expect( edu.transferTokensToExpert(0)).to.be.revertedWith('This is already not actual')
        })
    })

    describe("Canceling course",async () => {
        it("[USER] cant get money back while Pending", async () => {
            await expect(edu.connect(user1).getMoneyBack(1)).to.be.revertedWith('This course not canceled')
        })

        it("[USER] cant get money if expert not exist", async () => {
            await expect(edu.connect(user2).getMoneyBack(100)).to.be.revertedWith('Expert not exist')
        })

        it("[DEPLOYER] On Money back", async () => {
            expect((await edu.expertById(1)).status).equal(CourseStatus.Pending)
            await edu.OnMoneyBack(1)
            expect((await edu.expertById(1)).status).equal(CourseStatus.Canceled)
        })

        it("[DEPLOYER] Should to revert if already on", async ()=>{
            await expect(edu.OnMoneyBack(1)).to.be.revertedWith('This is already not actual')
        })
        
        it("[USER]cant get money if not donated Pending", async () => {
            await expect(edu.connect(user2).getMoneyBack(1)).to.be.revertedWith('Nothing to withdraw')
        })
    })

    describe("Get Money Back",async () => {
        it("[USER] Withdraw", async () => {
            await edu.connect(user1).getMoneyBack(1)
        })
        it("[USER] Cant Withdraw twice", async () => {
            await expect(edu.connect(user1).getMoneyBack(1)).to.be.revertedWith('Nothing to withdraw')
        })


    })

})