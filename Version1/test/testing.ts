import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber} from "ethers";

import { 
    MockUSDT, MockUSDT__factory,
    EducationPlatform, EducationPlatform__factory 
} from "../typechain-types";




describe("EDU Platform", async() => {
    
    let usdt: MockUSDT
    let edu : EducationPlatform
    let USDT: MockUSDT__factory
    let EDU : EducationPlatform__factory

    let user2: SignerWithAddress
    let user1: SignerWithAddress
    let expert: SignerWithAddress
    let deployer: SignerWithAddress

    async function transferStartFunds() {
        let decimal = await usdt.decimals()
        let num: BigNumber;
        num = (BigNumber.from(10)).pow(decimal).mul(10)
        await usdt.transfer(user1.address, num)
        await usdt.transfer(expert.address, num)

    }
    

    before(async()=>{
        [deployer, expert, user1, user2] = await ethers.getSigners()
        USDT = await ethers.getContractFactory("MockUSDT")
        usdt = await USDT.deploy()
        EDU  = await ethers.getContractFactory("EducationPlatform")
        edu  = await EDU.deploy(usdt.address)
    })

    it("Should to deploy", async () => {
        expect(await usdt.totalSupply()).deep.equal("1000000000000000000000000")
        expect(await edu.owner()).equal(deployer.address)
    })

    describe("Register Investor",async () => {
        it("[EXPERT] Should to add experts to register queue", async () => {
            await transferStartFunds()
            expect(await usdt.balanceOf(user1.address)).deep.equal('10000000000000000000')
            expect(await usdt.balanceOf(expert.address)).deep.equal('10000000000000000000')
    
            await edu.connect(expert).registerAsExpert("Donald Trump")
            expect((await edu.registrationRequests(expert.address)).isActive)
            expect( (await edu.registrationRequests(expert.address)).name).equal("Donald Trump")
        })
    
        it("[EXPERT] Should to revert if someone register twice", async () => {
            await expect(edu.connect(expert).registerAsExpert("same Donald Trump")).to.be.revertedWith('You request already active')
        })

        it("[DEPLOYER] Should accept registration", async () => {
            let Expert = expert.address

            expect((await edu.registrationRequests(Expert)).isActive)
            expect(await edu.isRegistered(Expert)).equal(false)
            
            await edu.approveExpert(Expert)
            expect(!(await edu.registrationRequests(Expert)).isActive)
            expect(await edu.isRegistered(Expert)).equal(true)
            expect((await edu.expertById(0)).expertAddress).equal(Expert)

            await expect(edu.approveExpert(Expert)).to.be.revertedWith('This Expert already registered')
        })
    })

    describe("Starting round", async () => {
        it("[DEPLOYER] Should to start round", async() =>{
            let budget = ((BigNumber.from(10)).pow(18)).mul(10)
            
            await expect(edu.startRound(1, budget)).to.be.revertedWith("You need to approve mote USDT to start round with that budget")
            await usdt.approve(edu.address, budget)
            await edu.startRound(1, budget)
            expect((await edu.roundById(1)).budget).equal(budget)
            
        })
    })
    describe("User votes", async () => {
        it("Should votes to expert", async ()=>{
            let donation = BigNumber.from(10).pow(18)
            expect((await edu.roundById(1)).totalVotes).equal(0)

            await expect(edu.connect(user1).donateInUSDT(0, donation)).to.be.revertedWith('You need to approve mote USDT to donate this')
            await usdt.connect(user1).approve(edu.address, donation.mul(2))
            
            await expect(edu.connect(user1).donateInUSDT(10, donation)).to.be.revertedWith('Expert not exist')
            await edu.connect(user1).donateInUSDT(0,donation)

            expect((await edu.roundById(1)).totalVotes).equal(1)
            expect((await edu.expertById(0)).usdtBalance).equal(donation)
            expect((await edu.expertById(0)).usdtBalance).equal(donation)
            
            await edu.connect(user1).donateInUSDT(0,donation)
            expect((await edu.roundById(1)).totalVotes).equal(1)
            expect((await edu.expertById(0)).usdtBalance).equal(donation.mul(2))
            expect((await edu.roundById(1)).endtime)
            expect((await edu.getExpertsInfoById(0))).equals(donation.mul(2))
        })
    })

    describe("Transfer funds for expert",async () => {
        it("Should transfer funds for expert", async () => {
            let budget = ((BigNumber.from(10)).pow(18)).mul(10)
            let donation = BigNumber.from(10).pow(18)
            let startBalance = await usdt.balanceOf(expert.address)
            await edu.transferTokensToExpert(0,1)
            expect(await edu.getExpertsCourseStatusInfoById(0)).equal(1)//DONE
            await expect(edu.transferTokensToExpert(0,1)).to.be.reverted
            await expect((await usdt.balanceOf(expert.address)).sub(startBalance)).equal((donation.mul(2)).add(budget))
        })
    })



    

    
   
    
    it("Should to send fundsBack to users")

})